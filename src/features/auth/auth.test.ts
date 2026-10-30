import { describe, expect, it } from "vitest";
import { authErrorKey, resetFailureIsSilent } from "./authErrors";
import { cooldownSecondsLeft } from "./cooldown";
import { isPasswordAcceptable, passwordStrength, strengthName } from "./passwordStrength";
import { isPlausibleEmail, isValidName, isValidUsername, normalizeUsername } from "./username";

const fb = (code: string) => ({ code: `auth/${code}` });

describe("password strength", () => {
  it("counts length, digit, capital and symbol", () => {
    expect(passwordStrength("")).toBe(0);
    expect(passwordStrength("abc")).toBe(0);
    expect(passwordStrength("abcdefgh")).toBe(1);
    expect(passwordStrength("abcdefg1")).toBe(2);
    expect(passwordStrength("Abcdefg1")).toBe(3);
    expect(passwordStrength("Abcdefg1!")).toBe(4);
  });

  it("names the step, and nothing for an empty password", () => {
    expect(strengthName(0, "")).toBeNull();
    expect(strengthName(1, "abcdefgh")).toBe("weak");
    expect(strengthName(2, "abcdefg1")).toBe("ok");
    expect(strengthName(3, "Abcdefg1")).toBe("good");
    expect(strengthName(4, "Abcdefg1!")).toBe("strong");
    expect(strengthName(0, "ab")).toBe("weak");
  });

  it("accepts from eight characters", () => {
    expect(isPasswordAcceptable("1234567")).toBe(false);
    expect(isPasswordAcceptable("12345678")).toBe(true);
  });
});

describe("username", () => {
  it("normalises what was typed", () => {
    expect(normalizeUsername("  @InkAlex ")).toBe("inkalex");
    expect(normalizeUsername("@@x_y")).toBe("x_y");
  });

  it("matches the rule: 3–20 of a–z, 0–9, _", () => {
    for (const ok of ["abc", "ink_alex", "a1_", "x".repeat(20)]) expect(isValidUsername(ok)).toBe(true);
    for (const bad of ["ab", "x".repeat(21), "Ink", "ink alex", "ink-alex", "ink.alex", "ключ", ""]) expect(isValidUsername(bad)).toBe(false);
  });

  it("checks email shape and name length", () => {
    expect(isPlausibleEmail("you@example.com")).toBe(true);
    for (const bad of ["", "you", "you@", "you@example", "a b@c.de"]) expect(isPlausibleEmail(bad)).toBe(false);
    expect(isValidName("  ")).toBe(false);
    expect(isValidName("Alex")).toBe(true);
    expect(isValidName("x".repeat(61))).toBe(false);
  });
});

describe("auth error messages", () => {
  it("login: a wrong password, an unknown email and a disabled account read the same", () => {
    const keys = ["wrong-password", "user-not-found", "invalid-credential", "user-disabled", "invalid-email"].map((c) => authErrorKey(fb(c), "login"));
    expect(new Set(keys)).toEqual(new Set(["invalidCredentials"]));
  });

  it("signup: says what the person can fix", () => {
    expect(authErrorKey(fb("email-already-in-use"), "signup")).toBe("emailInUse");
    expect(authErrorKey(fb("weak-password"), "signup")).toBe("weakPassword");
    expect(authErrorKey(fb("invalid-email"), "signup")).toBe("invalidEmail");
  });

  it("network and rate limits are the same everywhere", () => {
    for (const ctx of ["login", "signup", "reset", "provider", "verify"] as const) {
      expect(authErrorKey(fb("network-request-failed"), ctx)).toBe("network");
      expect(authErrorKey(fb("too-many-requests"), ctx)).toBe("tooManyRequests");
    }
  });

  it("closing the sign-in window is not an error", () => {
    expect(authErrorKey(fb("popup-closed-by-user"), "provider")).toBeNull();
    expect(authErrorKey(fb("cancelled-popup-request"), "provider")).toBeNull();
    expect(authErrorKey(fb("popup-blocked"), "provider")).toBe("popupBlocked");
    expect(authErrorKey(fb("account-exists-with-different-credential"), "provider")).toBe("provider");
  });

  it("anything else is unknown, including things that are not firebase errors", () => {
    expect(authErrorKey(new Error("boom"), "login")).toBe("unknown");
    expect(authErrorKey(null, "signup")).toBe("unknown");
  });

  it("a password reset hides whether the account exists", () => {
    expect(resetFailureIsSilent(fb("user-not-found"))).toBe(true);
    expect(resetFailureIsSilent({ code: "auth/internal-error" })).toBe(true);
    expect(resetFailureIsSilent(fb("invalid-email"))).toBe(false);
    expect(resetFailureIsSilent(fb("network-request-failed"))).toBe(false);
    expect(resetFailureIsSilent(fb("too-many-requests"))).toBe(false);
  });
});

describe("account change errors", () => {
  it("a wrong current password is said plainly (the person is signed in already)", () => {
    expect(authErrorKey(fb("wrong-password"), "account")).toBe("wrongPassword");
    expect(authErrorKey(fb("invalid-credential"), "account")).toBe("wrongPassword");
  });

  it("names what can be fixed", () => {
    expect(authErrorKey(fb("email-already-in-use"), "account")).toBe("emailTaken");
    expect(authErrorKey(fb("weak-password"), "account")).toBe("weakPassword");
    expect(authErrorKey(fb("invalid-email"), "account")).toBe("invalidEmail");
    expect(authErrorKey(fb("requires-recent-login"), "account")).toBe("reauthNeeded");
    expect(authErrorKey(fb("user-token-expired"), "account")).toBe("reauthNeeded");
    expect(authErrorKey(fb("user-mismatch"), "account")).toBe("reauthNeeded"); // re-auth after the email changed under the open page
    expect(authErrorKey(fb("popup-closed-by-user"), "account")).toBeNull();
    expect(authErrorKey(new Error("boom"), "account")).toBe("unknown");
  });
});

describe("resend cooldown", () => {
  it("counts whole seconds down to zero", () => {
    expect(cooldownSecondsLeft(null, 1000)).toBe(0);
    expect(cooldownSecondsLeft(0, 0)).toBe(60);
    expect(cooldownSecondsLeft(0, 500)).toBe(60);
    expect(cooldownSecondsLeft(0, 59_001)).toBe(1);
    expect(cooldownSecondsLeft(0, 60_000)).toBe(0);
    expect(cooldownSecondsLeft(0, 90_000)).toBe(0);
  });
});
