import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import en from "./locales/en.json";
import ru from "./locales/ru.json";
import ro from "./locales/ro.json";

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      ru: { translation: ru },
      ro: { translation: ro },
    },
    supportedLngs: ["en", "ru", "ro"],
    fallbackLng: "en",
    detection: {
      order: ["localStorage", "navigator"],
      caches: ["localStorage"],
    },
    interpolation: { escapeValue: false },
  });

// Dev only: lets the layout checks stretch the strings in the browser (window.__i18n).
if (import.meta.env.DEV && typeof window !== "undefined") (window as unknown as { __i18n?: typeof i18n }).__i18n = i18n;

export default i18n;
