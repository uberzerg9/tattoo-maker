import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useWorkspaceStore } from "../../store/workspaceStore";
import { ProfilePopover } from "./ProfilePopover";
import { UndoIcon } from "./icons";

export function TopBar() {
  const { t } = useTranslation();
  const resetLayout = useWorkspaceStore((s) => s.resetLayout);
  const [profileOpen, setProfileOpen] = useState(false);

  return (
    <>
      <header className="topbar">
        <span className="topbar__brand">
          {t("workspace.brand.a")}
          <span className="topbar__star">✶</span>
          {t("workspace.brand.b")}
        </span>
        <button
          type="button"
          className="icon-btn"
          aria-label={t("workspace.topbar.undo")}
        >
          <UndoIcon />
        </button>
        <button type="button" className="btn btn--yellow" onClick={resetLayout}>
          {t("workspace.topbar.reset")}
        </button>
        <button
          type="button"
          className="btn btn--pink"
          style={{ padding: "0 14px" }}
        >
          {t("workspace.topbar.save")}
        </button>
        <button
          type="button"
          className="topbar__avatar"
          aria-label={t("workspace.profile.open")}
          aria-expanded={profileOpen}
          onClick={() => setProfileOpen((open) => !open)}
        >
          AS
        </button>
      </header>
      {profileOpen && <ProfilePopover onClose={() => setProfileOpen(false)} />}
    </>
  );
}
