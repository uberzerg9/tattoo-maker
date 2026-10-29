import { useEffect, useState } from "react";
import type { RefObject } from "react";
import { useTranslation } from "react-i18next";
import type { DebugStats, TattooEngine } from "../../engine";
import { useFormat } from "../../i18n/useFormat";
import { useWorkspaceStore } from "../../store/workspaceStore";

const REFRESH_MS = 250;

/** Engine numbers for tuning. Only mounted with ?debug=1. */
export function DebugOverlay({
  engineRef,
}: {
  engineRef: RefObject<TattooEngine | null>;
}) {
  const { t } = useTranslation();
  const format = useFormat();
  const zoom = useWorkspaceStore((s) => s.zoom);
  const rotation = useWorkspaceStore((s) => s.rotation);
  const [stats, setStats] = useState<DebugStats | null>(null);
  const [showHits, setShowHits] = useState(false);
  const [showTrauma, setShowTrauma] = useState(false);
  const [overrideDepth, setOverrideDepth] = useState(false);
  const [forcedDepth, setForcedDepth] = useState(0.5);

  useEffect(() => {
    const id = window.setInterval(
      () => setStats(engineRef.current?.getDebugStats() ?? null),
      REFRESH_MS,
    );
    return () => window.clearInterval(id);
  }, [engineRef]);

  const dash = "–";
  const cursor = stats?.cursorMm
    ? `${format.decimal(stats.cursorMm.x)} × ${format.decimal(stats.cursorMm.y)}`
    : dash;
  const spacing =
    stats?.lastSpacingMm == null
      ? dash
      : format.decimal(stats.lastSpacingMm, 2);
  const depth =
    stats?.lastDepth == null ? dash : format.decimal(stats.lastDepth, 2);

  return (
    <div className="debug-overlay">
      <span>
        {t("workspace.debug.hitsPerSecond")}{" "}
        {format.integer(stats?.hitsPerSecond ?? 0)}
      </span>
      <span>
        {t("workspace.debug.speed")} {format.decimal(stats?.handSpeedMmS ?? 0)}
      </span>
      <span>
        {t("workspace.debug.spacing")} {spacing}
      </span>
      <span>
        {t("workspace.debug.depth")} {depth}
      </span>
      <span>
        {t("workspace.debug.hits")} {format.integer(stats?.hitCount ?? 0)} /{" "}
        {format.integer(stats?.strokeCount ?? 0)}
      </span>
      <span>
        {t("workspace.debug.ink")} {format.decimal((stats?.inkLevel ?? 1) * 100)}
      </span>
      <span>
        {t("workspace.debug.stampMs")} {format.decimal(stats?.stampMs ?? 0, 2)}
      </span>
      <span>
        {t("workspace.debug.dots")} {format.integer(stats?.lastBatchDots ?? 0)}
      </span>
      <span>
        {t("workspace.debug.gpuMs")}{" "}
        {stats?.gpuMs == null ? dash : format.decimal(stats.gpuMs, 2)}
      </span>
      <span>
        {t("workspace.debug.fps")} {format.integer(stats?.framesPerSecond ?? 0)}
      </span>
      <span>
        {t("workspace.debug.renderMs")} {format.decimal(stats?.renderMs ?? 0)}
      </span>
      <span>
        {t("workspace.debug.zoom")} {format.percent(zoom * 100)}
      </span>
      <span>
        {t("workspace.debug.rotation")} {format.degrees(rotation)}
      </span>
      <span>
        {t("workspace.debug.cursor")} {cursor}
      </span>
      <div className="debug-overlay__controls">
        <label>
          <input
            type="checkbox"
            checked={showHits}
            onChange={(e) => {
              setShowHits(e.target.checked);
              engineRef.current?.setDebugOptions({
                showHitCentres: e.target.checked,
              });
            }}
          />{" "}
          {t("workspace.debug.showHits")}
        </label>
        <label>
          <input
            type="checkbox"
            checked={showTrauma}
            onChange={(e) => {
              setShowTrauma(e.target.checked);
              engineRef.current?.setDebugOptions({
                showTraumaHeatmap: e.target.checked,
              });
            }}
          />{" "}
          {t("workspace.debug.showTrauma")}
        </label>
        <label>
          <input
            type="checkbox"
            checked={overrideDepth}
            onChange={(e) => {
              setOverrideDepth(e.target.checked);
              engineRef.current?.setDebugOptions({
                depthOverride: e.target.checked ? forcedDepth : null,
              });
            }}
          />{" "}
          {t("workspace.debug.depthOverride")}
        </label>
        <input
          type="range"
          className="debug-overlay__depth"
          min={0}
          max={1}
          step={0.05}
          value={forcedDepth}
          disabled={!overrideDepth}
          aria-label={t("workspace.debug.depthValue")}
          onChange={(e) => {
            const value = Number(e.target.value);
            setForcedDepth(value);
            engineRef.current?.setDebugOptions({ depthOverride: value });
          }}
        />
        <span className="debug-overlay__depth-value">
          {format.decimal(forcedDepth, 2)}
        </span>
        <button type="button" onClick={() => engineRef.current?.clearHits()}>
          {t("workspace.debug.clearHits")}
        </button>
      </div>
    </div>
  );
}
