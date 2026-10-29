import { useTranslation } from "react-i18next";
import { useFormat } from "../../i18n/useFormat";
import { useWorkspaceStore } from "../../store/workspaceStore";
import {
  MACHINE_HZ_LINING,
  MACHINE_HZ_MAX,
  MACHINE_HZ_MIN,
  MACHINE_HZ_SHADING,
  MACHINE_HZ_STEP,
} from "../workspace/config";
import { FloatingPanel } from "./FloatingPanel";

export function MachinePanel() {
  const { t } = useTranslation();
  const format = useFormat();
  const hz = useWorkspaceStore((s) => s.machineHz);
  const setMachineHz = useWorkspaceStore((s) => s.setMachineHz);

  return (
    <FloatingPanel
      id="machine"
      title={t("workspace.machine.title")}
      badge={`${format.integer(hz)} ${t("workspace.machine.hz")}`}
    >
      <div className="speed">
        <label className="speed__label" htmlFor="machine-speed">
          {t("workspace.machine.speed")}
        </label>
        <div className="speed__readout">
          <span className="speed__value">{format.integer(hz)}</span>
          <span className="speed__unit">{t("workspace.machine.hz")}</span>
        </div>
      </div>
      <input
        id="machine-speed"
        type="range"
        min={MACHINE_HZ_MIN}
        max={MACHINE_HZ_MAX}
        step={MACHINE_HZ_STEP}
        value={hz}
        onChange={(e) => setMachineHz(Number(e.target.value))}
      />
      <div className="panel-grid-2">
        <button
          type="button"
          className="btn btn--lg btn--on-lime"
          aria-pressed={hz === MACHINE_HZ_SHADING}
          onClick={() => setMachineHz(MACHINE_HZ_SHADING)}
        >
          {t("workspace.machine.presetShade")}
        </button>
        <button
          type="button"
          className="btn btn--lg btn--on-lime"
          aria-pressed={hz === MACHINE_HZ_LINING}
          onClick={() => setMachineHz(MACHINE_HZ_LINING)}
        >
          {t("workspace.machine.presetLine")}
        </button>
      </div>
      <p className="panel-hint">{t("workspace.machine.hint")}</p>
    </FloatingPanel>
  );
}
