import { useEffect, useRef } from "react";
import { shallow } from "zustand/shallow";
import { useTranslation } from "react-i18next";
import { useWorkspaceStore } from "../../store/workspaceStore";
import { useAuth } from "../auth/authContext";
import { useProfile } from "../session/useProfile";
import { layoutOf, sanitizePanelLayout } from "../workspace/panelLayout";
import { sanitizeSettings } from "./profileSettings";
import { savePanelLayout } from "./profileService";

/** Panel drags write a layout on every move; the profile only needs where they ended up. */
const LAYOUT_SAVE_DELAY_MS = 1000;

const store = useWorkspaceStore;

/**
 * Brings the person's saved preferences into the app, and keeps them saved:
 *  - on the first load after signing in: the interface language and the panel layout;
 *  - always: the workspace defaults (skin tone, speed, units), for the next new work;
 *  - panel moves and collapses are written back to settings.panelLayout after a short pause.
 * Mount it once, inside the AuthProvider.
 */
export function useProfileSync(): void {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const { i18n } = useTranslation();
  const profile = useProfile(uid);

  const appliedFor = useRef<string | null>(null);
  const lastLayout = useRef("");
  const layoutReady = useRef(false);

  const settings = profile?.settings;
  useEffect(() => {
    if (profile) store.getState().setDefaults(sanitizeSettings(settings));
  }, [profile, settings]);

  useEffect(() => {
    if (!uid) {
      appliedFor.current = null;
      layoutReady.current = false;
      return;
    }
    if (!profile || appliedFor.current === uid) return;
    appliedFor.current = uid;

    if (profile.language && profile.language !== i18n.resolvedLanguage) void i18n.changeLanguage(profile.language);

    const saved = sanitizePanelLayout(profile.settings?.panelLayout);
    if (saved) store.getState().applyPanelLayout(saved);
    const s = store.getState();
    lastLayout.current = JSON.stringify(layoutOf(s.panelPositions, s.panelOpen));
    layoutReady.current = true;

    // A blank workspace starts with the defaults; one with a work in it is left alone.
    store.getState().setDefaults(sanitizeSettings(profile.settings));
    if (!s.workSaved && !s.dirty) store.getState().applyDefaults();
  }, [uid, profile, i18n]);

  useEffect(() => {
    if (!uid) return;
    let timer = 0;
    const off = store.subscribe(
      (s) => ({ positions: s.panelPositions, open: s.panelOpen }),
      ({ positions, open }) => {
        if (!layoutReady.current) return;
        const layout = layoutOf(positions, open);
        const json = JSON.stringify(layout);
        if (json === lastLayout.current) return;
        window.clearTimeout(timer);
        timer = window.setTimeout(() => {
          lastLayout.current = json;
          void savePanelLayout(uid, layout).catch(() => undefined);
        }, LAYOUT_SAVE_DELAY_MS);
      },
      { equalityFn: shallow },
    );
    return () => {
      off();
      window.clearTimeout(timer);
    };
  }, [uid]);
}
