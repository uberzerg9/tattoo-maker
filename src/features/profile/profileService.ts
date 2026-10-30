import { doc, updateDoc } from "firebase/firestore";
import i18n from "../../i18n";
import { assertWritable, writesDisabled } from "../../lib/features";
import { db } from "../../lib/firebase";
import type { AppLanguage } from "../auth/authService";
import type { PanelLayout } from "../workspace/panelLayout";
import type { WorkspaceDefaults } from "./profileSettings";

const userRef = (uid: string) => doc(db, "users", uid);

/** The name and the workspace defaults, from the settings form. Only these fields are written. */
export async function saveSettings(uid: string, values: { name: string } & WorkspaceDefaults): Promise<void> {
  assertWritable();
  await updateDoc(userRef(uid), {
    name: values.name.trim(),
    "settings.skinTone": values.skinTone,
    "settings.machineHz": values.machineHz,
    "settings.units": values.units,
  });
}

/** Switches the interface at once and remembers the choice in the profile (when someone is signed in). */
export async function setLanguage(uid: string | null, language: AppLanguage): Promise<void> {
  await i18n.changeLanguage(language);
  if (uid && !writesDisabled()) await updateDoc(userRef(uid), { language });
}

export async function savePanelLayout(uid: string, layout: PanelLayout): Promise<void> {
  if (writesDisabled()) return; // a preview keeps the layout for this visit only
  await updateDoc(userRef(uid), { "settings.panelLayout": layout });
}
