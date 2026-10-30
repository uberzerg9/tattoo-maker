export type LegalDoc = "terms" | "privacy";

/** One section of a legal text: its keys under `legal.<doc>.sections.<id>` (paragraphs, then an optional list). */
export interface LegalSection {
  id: string;
  paragraphs: string[];
  items?: string[];
}

/** The order and shape of the texts; the words live in the locale files. */
export const LEGAL_SECTIONS: Record<LegalDoc, LegalSection[]> = {
  terms: [
    { id: "service", paragraphs: ["p1", "p2"] },
    { id: "noQualification", paragraphs: ["p1", "p2"] },
    { id: "account", paragraphs: ["p1", "p2"] },
    { id: "sketches", paragraphs: ["p1", "p2"] },
    { id: "rules", paragraphs: ["p1"] },
    { id: "beta", paragraphs: ["p1"] },
    { id: "liability", paragraphs: ["p1"] },
    { id: "ending", paragraphs: ["p1"] },
    { id: "contact", paragraphs: ["p1"] },
  ],
  privacy: [
    { id: "who", paragraphs: ["p1"] },
    { id: "data", paragraphs: ["intro"], items: ["account", "works", "sketches", "sessions", "device", "analytics"] },
    { id: "where", paragraphs: ["p1"] },
    { id: "why", paragraphs: ["p1"] },
    { id: "cookies", paragraphs: ["p1"] },
    { id: "sharing", paragraphs: ["p1"] },
    { id: "keep", paragraphs: ["p1"] },
    { id: "rights", paragraphs: ["p1"] },
    { id: "children", paragraphs: ["p1"] },
    { id: "changes", paragraphs: ["p1"] },
  ],
};
