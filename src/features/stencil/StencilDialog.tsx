import { useCallback, useEffect, useRef, useState } from "react";
import type { ChangeEvent, DragEvent, RefObject } from "react";
import { useTranslation } from "react-i18next";
import { SHEET_MM } from "../../engine/constants";
import { stencilSizeMm } from "../../engine/stencil";
import type { TattooEngine } from "../../engine";
import { useFormat } from "../../i18n/useFormat";
import { useWorkspaceStore } from "../../store/workspaceStore";
import { MAX_STENCIL_HEIGHT_MM } from "../../engine/stencil";
import { ACCEPTED_SKETCH_TYPES, SketchError, decodeSketch } from "./stencilFile";
import type { SketchErrorCode } from "./stencilFile";
import { StencilWorker } from "./StencilWorker";
import { hexToRgb, paintPreview } from "./stencilPreview";
import "./stencilDialog.css";

type Phase = "pick" | "loading" | "tune";

interface Sketch {
  name: string;
  url: string;
  width: number;
  height: number;
}

/** The tallest stencil, in cm, that fits the sheet: 15 cm, less for a wide sketch. */
const maxHeightFor = (width: number, height: number) =>
  Math.floor((Math.min(MAX_STENCIL_HEIGHT_MM, SHEET_MM.width / (width / height)) / 10) * 10) / 10;

const DEFAULTS = { threshold: 140, lineWeightPx: 2.5, removeFills: true, heightCm: 12 };
const PREVIEW_DEBOUNCE_MS = 120;
const STENCIL_RGB = [0x6a, 0x3f, 0xb5] as const;

interface StencilDialogProps {
  engineRef: RefObject<TattooEngine | null>;
}

/** Sketch → stencil: upload, tune the lines with a live preview, then transfer to the skin. */
export default function StencilDialog({ engineRef }: StencilDialogProps) {
  const { t } = useTranslation();
  const format = useFormat();
  const initialFile = useWorkspaceStore((s) => s.stencilDialog.file);
  const skinTone = useWorkspaceStore((s) => s.skinTone);
  const close = useWorkspaceStore((s) => s.closeStencilDialog);

  const [phase, setPhase] = useState<Phase>(initialFile ? "loading" : "pick");
  const [error, setError] = useState<SketchErrorCode | "failed" | null>(null);
  const [sketch, setSketch] = useState<Sketch | null>(null);
  const [settings, setSettings] = useState(DEFAULTS);
  const [sizeText, setSizeText] = useState(String(DEFAULTS.heightCm));
  const [engineReady, setEngineReady] = useState(false);
  /** The settings the preview on screen was made with. */
  const [shownKey, setShownKey] = useState<string | null>(null);
  const [transferring, setTransferring] = useState(false);
  const [dragging, setDragging] = useState(false);

  const workerRef = useRef<StencilWorker | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sketchUrlRef = useRef<string | null>(null);
  const keepUrlRef = useRef(false);
  /** The settings of the newest preview request. */
  const requestedKeyRef = useRef<string | null>(null);

  // The worker, and with it OpenCV, only exists while the dialog is open.
  useEffect(() => {
    const worker = new StencilWorker();
    workerRef.current = worker;
    void worker.ready().then(() => setEngineReady(true));
    worker.onError = () => setError("failed");
    return () => {
      worker.terminate();
      workerRef.current = null;
      if (sketchUrlRef.current && !keepUrlRef.current) URL.revokeObjectURL(sketchUrlRef.current);
    };
  }, []);

  // Live preview: paint the newest result of the worker.
  useEffect(() => {
    const worker = workerRef.current;
    if (!worker) return;
    worker.onPreview = ({ width, height, mask }) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const skinRgb = hexToRgb(getComputedStyle(document.documentElement).getPropertyValue(`--skin-${skinTone}`));
      canvas.width = width;
      canvas.height = height;
      canvas.getContext("2d")?.putImageData(new ImageData(paintPreview(mask, skinRgb, STENCIL_RGB), width, height), 0, 0);
      setShownKey(requestedKeyRef.current);
    };
  }, [skinTone, phase]);

  // The tallest stencil that fits the sheet: 15 cm, less for a wide sketch.
  const maxHeightCm = sketch ? maxHeightFor(sketch.width, sketch.height) : MAX_STENCIL_HEIGHT_MM / 10;

  /** Decodes a sketch and hands it to the worker. Changes no state: callers apply the result. */
  const prepare = useCallback(async (file: File): Promise<Sketch> => {
    const worker = workerRef.current;
    if (!worker) throw new Error("no worker");
    const bitmap = await decodeSketch(file);
    const { width, height } = bitmap;
    const url = URL.createObjectURL(file);
    try {
      await worker.load(bitmap);
    } catch (e) {
      URL.revokeObjectURL(url);
      throw e;
    }
    return { name: file.name, url, width, height };
  }, []);

  const showSketch = useCallback((next: Sketch) => {
    const heightCm = Math.min(DEFAULTS.heightCm, maxHeightFor(next.width, next.height));
    if (sketchUrlRef.current) URL.revokeObjectURL(sketchUrlRef.current);
    sketchUrlRef.current = next.url;
    setSketch(next);
    setSettings((s) => ({ ...s, heightCm }));
    setSizeText(String(heightCm));
    setShownKey(null);
    setPhase("tune");
  }, []);

  const showError = useCallback((e: unknown) => {
    setError(e instanceof SketchError ? e.code : "failed");
    setPhase(sketchUrlRef.current ? "tune" : "pick");
  }, []);

  /** A sketch chosen or dropped inside the dialog. */
  const loadSketch = (file: File) => {
    setError(null);
    setPhase("loading");
    prepare(file).then(showSketch, showError);
  };

  // A sketch dropped on the panel starts the dialog already loaded.
  useEffect(() => {
    if (!initialFile) return;
    let alive = true;
    prepare(initialFile).then(
      (next) => (alive ? showSketch(next) : URL.revokeObjectURL(next.url)),
      (e: unknown) => alive && showError(e),
    );
    return () => {
      alive = false;
    };
  }, [initialFile, prepare, showSketch, showError]);

  // Debounced preview request whenever the settings change.
  const settingsKey = JSON.stringify(settings);
  useEffect(() => {
    if (phase !== "tune" || !sketch) return;
    const id = window.setTimeout(() => {
      requestedKeyRef.current = settingsKey;
      workerRef.current?.preview({
        threshold: settings.threshold,
        lineWeightPx: settings.lineWeightPx,
        removeFills: settings.removeFills,
        heightMm: settings.heightCm * 10,
      });
    }, PREVIEW_DEBOUNCE_MS);
    return () => window.clearTimeout(id);
  }, [phase, sketch, settings, settingsKey]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !transferring) close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close, transferring]);

  const onPick = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) loadSketch(file);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) loadSketch(file);
  };

  const onSize = (value: string) => {
    setSizeText(value);
    const n = Number(value.replace(",", "."));
    if (Number.isFinite(n) && n >= 1) setSettings((s) => ({ ...s, heightCm: Math.min(n, maxHeightCm) }));
  };

  const transfer = async () => {
    const worker = workerRef.current;
    const engine = engineRef.current;
    if (!worker || !engine || !sketch) return;
    setTransferring(true);
    setError(null);
    try {
      const result = await worker.final({
        threshold: settings.threshold,
        lineWeightPx: settings.lineWeightPx,
        removeFills: settings.removeFills,
        heightMm: settings.heightCm * 10,
      });
      engine.setStencil(result.mask, result.distanceMm);
      keepUrlRef.current = true; // the panel thumbnail now owns the sketch's object URL
      useWorkspaceStore.getState().stencilTransferred({
        fileName: sketch.name,
        thumbUrl: sketch.url,
        size: stencilSizeMm(result.width, result.height),
      });
      close();
    } catch {
      setError("failed");
      setTransferring(false);
    }
  };

  const step = phase === "pick" ? 1 : 2;
  const status = !sketch
    ? null
    : transferring
      ? t("workspace.stencil.dialog.transferring")
      : !engineReady
        ? t("workspace.stencil.dialog.loadingEngine")
        : shownKey !== settingsKey
          ? t("workspace.stencil.dialog.working")
          : null;

  return (
    <div className="stencil-backdrop" onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
      <div className="stencil-dialog" role="dialog" aria-modal="true" aria-labelledby="stencil-dialog-title">
        <div className="stencil-dialog__step" aria-hidden="true">
          {t("workspace.stencil.dialog.step", { n: format.integer(step) })}
        </div>

        <header className="stencil-dialog__header">
          <h1 id="stencil-dialog-title" className="stencil-dialog__title">
            {t("workspace.stencil.dialog.title")}
          </h1>
          <div className="stencil-dialog__header-end">
            <ol className="stencil-dialog__steps">
              <li className={step === 1 ? "is-active" : ""}>{t("workspace.stencil.dialog.steps.upload")}</li>
              <li className={step === 2 ? "is-active" : ""}>{t("workspace.stencil.dialog.steps.lines")}</li>
              <li>{t("workspace.stencil.dialog.steps.place")}</li>
            </ol>
            <button
              type="button"
              className="stencil-dialog__close"
              aria-label={t("workspace.stencil.dialog.close")}
              disabled={transferring}
              onClick={close}
              autoFocus
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
                <path d="M6 6l12 12" />
                <path d="M18 6L6 18" />
              </svg>
            </button>
          </div>
        </header>

        <input
          ref={fileInputRef}
          type="file"
          hidden
          accept={ACCEPTED_SKETCH_TYPES.join(",")}
          onChange={onPick}
          data-testid="sketch-file"
        />

        {phase !== "tune" || !sketch ? (
          <div className="stencil-dialog__body stencil-dialog__body--pick">
            <div className={dragging ? "stencil-drop is-over" : "stencil-drop"} onDragEnter={() => setDragging(true)} onDragLeave={() => setDragging(false)}>
              <p className="stencil-drop__title">{t("workspace.stencil.dialog.dropTitle")}</p>
              <p className="stencil-drop__hint">{t("workspace.stencil.dialog.dropHint")}</p>
              <button type="button" className="btn btn--lg btn--raised btn--pink" disabled={phase === "loading"} onClick={() => fileInputRef.current?.click()}>
                {phase === "loading" ? t("workspace.stencil.dialog.working") : t("workspace.stencil.dialog.chooseFile")}
              </button>
              {error && (
                <p className="stencil-dialog__error" role="alert">
                  {t(`workspace.stencil.dialog.errors.${error}`)}
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="stencil-dialog__body">
            <div className="stencil-dialog__previews">
              <figure className="stencil-figure">
                <div className="stencil-figure__frame stencil-figure__frame--paper">
                  <img src={sketch.url} alt={t("workspace.stencil.dialog.originalAria")} />
                </div>
                <figcaption>{t("workspace.stencil.dialog.original", { name: sketch.name })}</figcaption>
              </figure>
              <figure className="stencil-figure">
                <div className="stencil-figure__frame stencil-figure__frame--skin" style={{ background: `var(--skin-${skinTone})` }}>
                  <canvas ref={canvasRef} role="img" aria-label={t("workspace.stencil.dialog.onSkinAria")} />
                </div>
                <figcaption>
                  {t("workspace.stencil.dialog.onSkin")}
                  {status && <span className="stencil-figure__status" role="status"> · {status}</span>}
                </figcaption>
              </figure>
            </div>

            <div className="stencil-controls">
              <div className="stencil-control">
                <div className="stencil-control__head">
                  <label htmlFor="stencil-threshold">{t("workspace.stencil.dialog.threshold")}</label>
                  <span className="stencil-control__value">{format.integer(settings.threshold)}</span>
                </div>
                <input id="stencil-threshold" type="range" min={0} max={255} step={1} value={settings.threshold} onChange={(e) => setSettings((s) => ({ ...s, threshold: Number(e.target.value) }))} />
                <span className="stencil-control__hint">{t("workspace.stencil.dialog.thresholdHint")}</span>
              </div>
              <div className="stencil-control">
                <div className="stencil-control__head">
                  <label htmlFor="stencil-weight">{t("workspace.stencil.dialog.weight")}</label>
                  <span className="stencil-control__value">
                    {format.decimal(settings.lineWeightPx)} {t("workspace.stencil.dialog.unitPx")}
                  </span>
                </div>
                <input id="stencil-weight" type="range" min={1} max={6} step={0.5} value={settings.lineWeightPx} onChange={(e) => setSettings((s) => ({ ...s, lineWeightPx: Number(e.target.value) }))} />
              </div>
              <label className="stencil-check">
                <input type="checkbox" checked={settings.removeFills} onChange={(e) => setSettings((s) => ({ ...s, removeFills: e.target.checked }))} />
                {t("workspace.stencil.dialog.removeFills")}
              </label>
              <div className="stencil-control">
                <label htmlFor="stencil-size">{t("workspace.stencil.dialog.size")}</label>
                <div className="stencil-size">
                  <input id="stencil-size" type="number" inputMode="decimal" min={1} max={maxHeightCm} step={0.5} value={sizeText} onChange={(e) => onSize(e.target.value)} />
                  <span>{t("workspace.stencil.dialog.cmTall")}</span>
                </div>
              </div>
              <p className="stencil-dialog__note">{t("workspace.stencil.dialog.sizeHint", { max: format.decimal(maxHeightCm) })}</p>
              {error && (
                <p className="stencil-dialog__error" role="alert">
                  {t(`workspace.stencil.dialog.errors.${error}`)}
                </p>
              )}
            </div>
          </div>
        )}

        <footer className="stencil-dialog__footer">
          <button type="button" className="btn btn--lg" disabled={transferring} onClick={() => fileInputRef.current?.click()}>
            {t("workspace.stencil.dialog.otherFile")}
          </button>
          <div className="stencil-dialog__actions">
            <button type="button" className="btn btn--lg" disabled={transferring} onClick={close}>
              {t("workspace.stencil.dialog.cancel")}
            </button>
            <button type="button" className="btn btn--lg btn--raised btn--pink stencil-dialog__transfer" disabled={phase !== "tune" || !engineReady || transferring} onClick={() => void transfer()}>
              {t("workspace.stencil.dialog.transfer")}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
