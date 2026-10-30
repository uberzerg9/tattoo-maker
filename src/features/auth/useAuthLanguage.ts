import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { auth } from "../../lib/firebase";

/** Firebase writes its emails (verification, password reset) in `auth.languageCode`: keep it on the UI language. */
export function useAuthLanguage(): void {
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? "en";
  useEffect(() => {
    auth.languageCode = language;
  }, [language]);
}
