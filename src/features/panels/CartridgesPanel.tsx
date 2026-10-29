import { useTranslation } from "react-i18next";
import { useFormat } from "../../i18n/useFormat";
import { useWorkspaceStore } from "../../store/workspaceStore";
import { CARTRIDGES } from "../workspace/config";
import { FloatingPanel } from "./FloatingPanel";

export function CartridgesPanel() {
  const { t } = useTranslation();
  const format = useFormat();
  const cartridge = useWorkspaceStore((s) => s.cartridge);
  const setCartridge = useWorkspaceStore((s) => s.setCartridge);
  const current = CARTRIDGES.find((c) => c.id === cartridge) ?? CARTRIDGES[0];

  return (
    <FloatingPanel
      id="carts"
      title={t("workspace.carts.title")}
      badge={current ? `${format.twoDigits(current.needles)} ${current.group}` : ""}
      bodyClassName="panel__body--carts"
    >
      {CARTRIDGES.map((c) => (
        <button
          key={c.id}
          type="button"
          className="cart-row"
          aria-pressed={c.id === cartridge}
          onClick={() => setCartridge(c.id)}
        >
          <span className="cart-row__count">{format.twoDigits(c.needles)}</span>
          <span className="cart-row__text">
            <span className="cart-row__name">
              {c.group} · {t(`workspace.carts.items.${c.id}.type`)}
            </span>
            <span className="cart-row__use">{t(`workspace.carts.items.${c.id}.use`)}</span>
          </span>
        </button>
      ))}
    </FloatingPanel>
  );
}
