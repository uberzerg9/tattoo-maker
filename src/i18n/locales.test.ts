import { describe, expect, it } from "vitest";
import en from "./locales/en.json";
import ro from "./locales/ro.json";
import ru from "./locales/ru.json";

const LANGUAGES = { en, ru, ro } as const;
type Tree = { [key: string]: string | Tree };

const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;

function flatten(tree: Tree, prefix = ""): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix + key;
    if (typeof value === "string") out[path] = value;
    else Object.assign(out, flatten(value, path + "."));
  }
  return out;
}

const flat = Object.fromEntries(Object.entries(LANGUAGES).map(([lang, tree]) => [lang, flatten(tree as Tree)])) as Record<keyof typeof LANGUAGES, Record<string, string>>;

/** The key without its plural suffix: `a.b_few` → `a.b`. Languages have different plural forms, so keys are compared by base. */
const baseOf = (key: string) => key.replace(PLURAL_SUFFIX, "");
const bases = (lang: keyof typeof LANGUAGES) => new Set(Object.keys(flat[lang]).map(baseOf));

/** The `{{names}}` a string uses, ignoring formatting such as `{{count, number}}`. */
const placeholders = (text: string) => [...text.matchAll(/{{\s*([\w.]+)/g)].map((m) => m[1]!);

/**
 * Strings that may be the same as in English: brand names, units, loanwords the tattoo trade uses as they are
 * (liner, shader, magnum, stencil, email), placeholders and the dev-only debug overlay.
 */
const SAME_AS_ENGLISH = [
  /^app\.title$/,
  /^workspace\.(brand|decor)\./,
  /^workspace\.(machine\.hz|units\.)/,
  /^workspace\.carts\.items\.[^.]+\.type$/,
  /^workspace\.(stencil\.title|toolbar\.stencil|stencil\.dialog\.original)$/,
  /^workspace\.debug\./,
  /^legal\.terms\.sections\.contact\.title$/, // "Contact" is Romanian too
  /^auth\.common\.(email|emailPlaceholder)$/,
  /^auth\.signup\.(namePlaceholder|usernamePlaceholder)$/,
];

describe("locales", () => {
  for (const lang of ["ru", "ro"] as const) {
    it(`${lang} has exactly the keys of en (plural forms aside)`, () => {
      const source = bases("en");
      const target = bases(lang);
      expect([...source].filter((k) => !target.has(k))).toEqual([]);
      expect([...target].filter((k) => !source.has(k))).toEqual([]);
    });
  }

  for (const lang of Object.keys(LANGUAGES) as (keyof typeof LANGUAGES)[]) {
    it(`${lang}: no empty strings`, () => {
      expect(Object.entries(flat[lang]).filter(([, v]) => v.trim() === "").map(([k]) => k)).toEqual([]);
    });

    it(`${lang}: every plural has exactly the forms the language uses`, () => {
      const needed = new Set(new Intl.PluralRules(lang).resolvedOptions().pluralCategories);
      const forms = new Map<string, Set<string>>();
      for (const key of Object.keys(flat[lang])) {
        const match = key.match(PLURAL_SUFFIX);
        if (!match) continue;
        const base = baseOf(key);
        forms.set(base, (forms.get(base) ?? new Set()).add(match[1]!));
      }
      const wrong = [...forms].filter(([, have]) => have.size !== needed.size || [...have].some((f) => !needed.has(f as Intl.LDMLPluralRule))).map(([base]) => base);
      expect(wrong).toEqual([]);
    });
  }

  it("a plural in one language is a plural in the others, unless English needs no separate form", () => {
    const pluralBases = (lang: keyof typeof LANGUAGES) => new Set(Object.keys(flat[lang]).filter((k) => PLURAL_SUFFIX.test(k)).map(baseOf));
    for (const lang of ["ru", "ro"] as const) {
      for (const base of pluralBases("en")) expect(pluralBases(lang).has(base), `${lang} lacks plural forms of ${base}`).toBe(true);
    }
  });

  for (const lang of ["ru", "ro"] as const) {
    it(`${lang} uses the same {{placeholders}} as en`, () => {
      const names = (lang_: keyof typeof LANGUAGES, base: string) =>
        [...new Set(Object.entries(flat[lang_]).filter(([k]) => baseOf(k) === base).flatMap(([, v]) => placeholders(v)))].sort();
      const differing = [...bases("en")].filter((base) => JSON.stringify(names("en", base)) !== JSON.stringify(names(lang, base)));
      expect(differing).toEqual([]);
    });

    it(`${lang} is translated: no string left as the English text`, () => {
      const untouched = Object.entries(flat.en)
        .filter(([key, text]) => /\p{L}{3,}/u.test(text) && !SAME_AS_ENGLISH.some((re) => re.test(baseOf(key))) && flat[lang][key] === text)
        .map(([key]) => key);
      expect(untouched).toEqual([]);
    });
  }
});
