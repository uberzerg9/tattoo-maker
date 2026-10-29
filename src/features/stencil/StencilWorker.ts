import type { StencilRequest, StencilResponse, StencilSettings } from "../../workers/stencilProtocol";

export interface PreviewResult {
  width: number;
  height: number;
  mask: Uint8Array;
}

export interface FinalResult {
  width: number;
  height: number;
  mask: ImageBitmap;
  distanceMm: Float32Array;
}

/**
 * Client for stencil.worker.ts. Creating it starts the worker, which is what loads OpenCV,
 * so create one only when the dialog opens.
 */
export class StencilWorker {
  private readonly worker: Worker;
  private nextId = 1;
  private latestPreview = 0;
  private readonly waiting = new Map<number, { resolve: (r: never) => void; reject: (e: Error) => void }>();
  private readonly readyWaiters: (() => void)[] = [];
  private isReady = false;

  /** Called with the newest preview; results of superseded requests are dropped. */
  onPreview: ((result: PreviewResult) => void) | null = null;
  /** Called when the worker fails on a preview request (loading OpenCV failed, bad input, …). */
  onError: ((message: string) => void) | null = null;

  constructor() {
    this.worker = new Worker(new URL("../../workers/stencil.worker.ts", import.meta.url), { type: "module" });
    this.worker.onmessage = (e: MessageEvent<StencilResponse>) => this.handle(e.data);
    this.worker.onerror = (e) => this.onError?.(e.message);
  }

  /** Resolves when OpenCV has finished loading. */
  ready(): Promise<void> {
    return this.isReady ? Promise.resolve() : new Promise((resolve) => this.readyWaiters.push(resolve));
  }

  /** Gives the worker the sketch; the bitmap is transferred and cannot be used afterwards. */
  load(bitmap: ImageBitmap): Promise<{ width: number; height: number }> {
    return this.request({ type: "load", id: this.nextId++, bitmap }, [bitmap]);
  }

  /** Asks for a live preview. Only the newest request's result is delivered, via onPreview. */
  preview(settings: StencilSettings): void {
    const id = this.nextId++;
    this.latestPreview = id;
    this.worker.postMessage({ type: "preview", id, settings } satisfies StencilRequest);
  }

  /** Full resolution mask and distance field. */
  final(settings: StencilSettings): Promise<FinalResult> {
    return this.request({ type: "final", id: this.nextId++, settings });
  }

  terminate(): void {
    this.worker.terminate();
    for (const w of this.waiting.values()) w.reject(new Error("terminated"));
    this.waiting.clear();
  }

  private request<T>(req: StencilRequest, transfer: Transferable[] = []): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.waiting.set(req.id, { resolve: resolve as (r: never) => void, reject });
      this.worker.postMessage(req, transfer);
    });
  }

  private handle(msg: StencilResponse): void {
    switch (msg.type) {
      case "ready":
        this.isReady = true;
        this.readyWaiters.splice(0).forEach((resolve) => resolve());
        break;
      case "loaded":
        this.settle(msg.id, { width: msg.width, height: msg.height });
        break;
      case "preview":
        if (msg.id === this.latestPreview) this.onPreview?.({ width: msg.width, height: msg.height, mask: msg.mask });
        break;
      case "final":
        this.settle(msg.id, { width: msg.width, height: msg.height, mask: msg.mask, distanceMm: msg.distanceMm });
        break;
      case "error": {
        const w = this.waiting.get(msg.id);
        if (w) {
          this.waiting.delete(msg.id);
          w.reject(new Error(msg.message));
        } else {
          this.onError?.(msg.message);
        }
        break;
      }
    }
  }

  private settle(id: number, value: unknown): void {
    const w = this.waiting.get(id);
    if (!w) return;
    this.waiting.delete(id);
    w.resolve(value as never);
  }
}
