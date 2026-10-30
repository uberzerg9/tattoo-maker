import { describe, expect, it } from "vitest";
import en from "../../i18n/locales/en.json";
import ro from "../../i18n/locales/ro.json";
import ru from "../../i18n/locales/ru.json";
import { LEGAL_SECTIONS } from "./legalContent";
import type { LegalDoc } from "./legalContent";

type Tree = { [key: string]: string | Tree };
const get = (tree: Tree, path: string): string | Tree | undefined => path.split(".").reduce<string | Tree | undefined>((node, part) => (typeof node === "object" ? node[part] : undefined), tree);

const DOCS = Object.keys(LEGAL_SECTIONS) as LegalDoc[];

describe("legal texts", () => {
  for (const [lang, tree] of Object.entries({ en, ru, ro })) {
    it(`${lang}: every section the page renders has its text, and the draft notice exists`, () => {
      const missing: string[] = [];
      for (const key of ["legal.draftTitle", "legal.draftText"]) if (!get(tree as Tree, key)) missing.push(key);
      for (const doc of DOCS) {
        if (!get(tree as Tree, `legal.${doc}.title`)) missing.push(`legal.${doc}.title`);
        for (const section of LEGAL_SECTIONS[doc]) {
          const base = `legal.${doc}.sections.${section.id}`;
          for (const key of ["title", ...section.paragraphs, ...(section.items ?? [])]) if (!get(tree as Tree, `${base}.${key}`)) missing.push(`${base}.${key}`);
        }
      }
      expect(missing).toEqual([]);
    });
  }

  it("every section in the locale files is rendered (none is orphaned)", () => {
    for (const doc of DOCS) {
      const inFile = Object.keys(((en.legal as Tree)[doc] as Tree).sections as Tree).sort();
      expect(inFile).toEqual(LEGAL_SECTIONS[doc].map((s) => s.id).sort());
    }
  });

  it("the contact address is passed to the texts that mention it", () => {
    expect(JSON.stringify(en.legal)).toContain("{{email}}");
  });
});
