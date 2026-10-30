import { beforeEach, describe, expect, it } from "vitest";
import { ZOOM_MAX, ZOOM_MIN, ZOOM_STEP } from "../features/workspace/config";
import { useWorkspaceStore } from "./workspaceStore";

const store = useWorkspaceStore;

describe("zoom range", () => {
  beforeEach(() => store.setState({ zoom: 1, offsetX: 0, offsetY: 0, rotation: 0 }));

  it("runs from 50% to 400%", () => {
    expect(ZOOM_MIN).toBe(0.5);
    expect(ZOOM_MAX).toBe(4);
  });

  it("clamps what is asked for to that range", () => {
    store.getState().setZoom(10);
    expect(store.getState().zoom).toBe(4);
    store.getState().setZoom(0.1);
    expect(store.getState().zoom).toBe(0.5);
    store.getState().setZoom(2.5);
    expect(store.getState().zoom).toBe(2.5);
  });

  it("reaches both ends exactly with the toolbar's steps", () => {
    for (let i = 0; i < 40; i++) store.getState().setZoom(store.getState().zoom + ZOOM_STEP);
    expect(store.getState().zoom).toBe(ZOOM_MAX);
    for (let i = 0; i < 40; i++) store.getState().setZoom(store.getState().zoom - ZOOM_STEP);
    expect(store.getState().zoom).toBe(ZOOM_MIN);
  });

  it("keeps the offset inside the clamp when zooming (the sheet stays on screen)", () => {
    store.setState({ stageWidth: 1200, stageHeight: 800 } as never);
    store.getState().setZoom(4);
    store.getState().setOffset(100000, 100000);
    const { offsetX, offsetY } = store.getState();
    expect(Math.abs(offsetX)).toBeLessThan(100000);
    expect(Math.abs(offsetY)).toBeLessThan(100000);
  });
});
