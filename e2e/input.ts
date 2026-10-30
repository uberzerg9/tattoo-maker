import type { CDPSession, Page } from "@playwright/test";

/** Real multi-touch and pen input through the DevTools protocol: the page sees genuine pointer events with pointerType touch / pen. */
export class Pointers {
  private readonly touches = new Map<number, { x: number; y: number }>();
  private readonly cdp: CDPSession;

  private constructor(cdp: CDPSession) {
    this.cdp = cdp;
  }

  static async attach(page: Page): Promise<Pointers> {
    return new Pointers(await page.context().newCDPSession(page));
  }

  private points() {
    return [...this.touches].map(([id, p]) => ({ id, x: p.x, y: p.y, radiusX: 8, radiusY: 8, force: 1 }));
  }

  async touchDown(id: number, x: number, y: number): Promise<void> {
    this.touches.set(id, { x, y });
    await this.cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: this.points() });
  }

  /** Moves some of the fingers; the rest stay where they are. */
  async touchMove(to: Record<number, { x: number; y: number }>): Promise<void> {
    for (const [id, p] of Object.entries(to)) this.touches.set(Number(id), p);
    await this.cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: this.points() });
  }

  async touchUp(id: number): Promise<void> {
    this.touches.delete(id);
    await this.cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: this.points() });
  }

  async penDown(x: number, y: number): Promise<void> {
    await this.cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", buttons: 1, clickCount: 1, pointerType: "pen", force: 0.5 });
  }

  async penMove(x: number, y: number): Promise<void> {
    await this.cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, button: "left", buttons: 1, pointerType: "pen", force: 0.5 });
  }

  async penUp(x: number, y: number): Promise<void> {
    await this.cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", buttons: 0, clickCount: 1, pointerType: "pen" });
  }
}
