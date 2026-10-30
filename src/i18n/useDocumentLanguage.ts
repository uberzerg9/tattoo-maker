import { useEffect } from "react";
import { useTranslation } from "react-i18next";

/** Keeps <html lang> and the tab title on the UI language (screen readers, hyphenation, browser translate). */
export function useDocumentLanguage(): void {
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? "en";
  useEffect(() => {
    document.documentElement.lang = language;
    document.title = t("app.title");
  }, [language, t]);
}
