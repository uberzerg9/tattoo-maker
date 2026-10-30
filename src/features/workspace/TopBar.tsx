import { writesDisabled } from "../../lib/features";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useWorkspaceStore } from "../../store/workspaceStore";
import { useAuthUser } from "../session/useAuthUser";
import { initialsOf, useProfile } from "../session/useProfile";
import { ProfilePopover } from "./ProfilePopover";
import { UndoIcon } from "./icons";
import { SaveIndicator } from "./SaveIndicator";

export function TopBar() {
  const { t } = useTranslation();
  const resetLayout = useWorkspaceStore((s) => s.resetLayout);
  const save = useWorkspaceStore((s) => s.save);
  const undo = useWorkspaceStore((s) => s.undo);
  const requestWork = useWorkspaceStore((s) => s.requestWork);
  const undoSteps = useWorkspaceStore((s) => s.undoSteps);
  const profile = useProfile(useAuthUser()?.uid ?? null);
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
          disabled={undoSteps === 0}
          onClick={undo}
        >
          <UndoIcon />
        </button>
        <button type="button" className="btn btn--lime" onClick={() => requestWork({ kind: "new" })}>
          {t("workspace.work.new")}
        </button>
        <button type="button" className="btn btn--yellow" onClick={resetLayout}>
          {t("workspace.topbar.reset")}
        </button>
        <SaveIndicator />
        <button
          type="button"
          className="btn btn--pink"
          style={{ padding: "0 14px" }}
          disabled={writesDisabled()}
          onClick={save}
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
          {profile?.name ? initialsOf(profile.name) : "•"}
        </button>
      </header>
      {profileOpen && <ProfilePopover onClose={() => setProfileOpen(false)} />}
    </>
  );
}
