import { useMemo } from "react";
import { useTranslation } from "react-i18next";

/** Locale-aware number formatters bound to the current UI language. */
export function useFormat() {
  const { i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? "en";

  return useMemo(() => {
    const integer = new Intl.NumberFormat(lang, { maximumFractionDigits: 0 });
    const decimals = (digits: number) =>
      new Intl.NumberFormat(lang, {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      });
    const decimal1 = decimals(1);
    const decimal2 = decimals(2);
    const twoDigits = new Intl.NumberFormat(lang, { minimumIntegerDigits: 2 });
    const percent = new Intl.NumberFormat(lang, {
      style: "percent",
      maximumFractionDigits: 0,
    });
    const degrees = new Intl.NumberFormat(lang, {
      style: "unit",
      unit: "degree",
      unitDisplay: "narrow",
    });
    const millimetres = new Intl.NumberFormat(lang, {
      style: "unit",
      unit: "millimeter",
      maximumFractionDigits: 1,
    });

    return {
      integer: (n: number) => integer.format(n),
      decimal: (n: number, digits = 1) =>
        (digits === 2 ? decimal2 : decimal1).format(n),
      twoDigits: (n: number) => twoDigits.format(n),
      /** Takes a 0–100 value. */
      percent: (n: number) => percent.format(n / 100),
      degrees: (n: number) => degrees.format(n),
      millimetres: (n: number) => millimetres.format(n),
    };
  }, [lang]);
}
