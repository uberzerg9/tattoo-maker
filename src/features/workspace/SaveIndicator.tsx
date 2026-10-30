import { useTranslation } from "react-i18next";
import { useWorkspaceStore } from "../../store/workspaceStore";
import { writesDisabled } from "../../lib/features";
import { useAuthUser } from "../session/useAuthUser";

/** Where the work stands: saving, saved, saved only on this device, or changed since the last save. */
export function SaveIndicator() {
  const { t } = useTranslation();
  const signedIn = useAuthUser() !== null;
  const status = useWorkspaceStore((s) => s.saveStatus);
  const dirty = useWorkspaceStore((s) => s.dirty);
  const loading = useWorkspaceStore((s) => s.workLoading);
  if (!signedIn || writesDisabled()) return null; // a preview saves nothing, so there is nothing to report

  let key: string | null = null;
  if (loading) key = "opening";
  else if (status === "saving") key = "saving";
  else if (status === "offline") key = "offline";
  else if (status === "failed") key = "failed";
  else if (dirty) key = "unsaved";
  else if (status === "saved") key = "saved";
  if (!key) return null;

  return (
    <span className={`save-status save-status--${key}`} role="status" data-testid="save-status">
      {t(`workspace.work.status.${key}`)}
    </span>
  );
}
