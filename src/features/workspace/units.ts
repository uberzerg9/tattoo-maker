export type Units = "cm" | "in";

const CM_PER_INCH = 2.54;

export const isUnits = (value: unknown): value is Units => value === "cm" || value === "in";

/** A length in cm as it is shown in the chosen units. */
export const toDisplay = (cm: number, units: Units): number => (units === "in" ? cm / CM_PER_INCH : cm);

/** A length typed in the chosen units, in cm. */
export const fromDisplay = (value: number, units: Units): number => (units === "in" ? value * CM_PER_INCH : value);

/** Step of a size input: half a cm, a quarter of an inch. */
export const displayStep = (units: Units): number => (units === "in" ? 0.25 : 0.5);
