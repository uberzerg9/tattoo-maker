import type { Analytics, EventParams } from "firebase/analytics";
import { currentConsent, subscribeConsent } from "./consent";
import type { ConsentChoice } from "./consent";
import { writesDisabled } from "./features";

/** The parts of firebase/analytics this wrapper uses, so tests can stand in for them. */
export interface AnalyticsSdk {
  isSupported(): Promise<boolean>;
  start(): Analytics;
  logEvent(analytics: Analytics, name: string, params: EventParams): void;
  setCollectionEnabled(analytics: Analytics, enabled: boolean): void;
}

export interface AnalyticsDeps {
  /** True in `vite dev`: nothing is ever collected. */
  isDev: boolean;
  measurementId: string | undefined;
  consent: () => ConsentChoice | null;
  /** Loads the SDK. Called only once the person has accepted, so nothing reaches Google before that. */
  loadSdk: () => Promise<AnalyticsSdk>;
  /** Removes the cookies Google Analytics set (`_ga`, `_ga_<id>`). */
  clearCookies: () => void;
}

/**
 * Analytics that run only when all of these hold: not in dev, a measurement id exists, the browser
 * supports it, and the person accepted analytics cookies. Rejecting later stops collection and
 * removes the cookies. Every call is safe to make when analytics are off: it does nothing.
 */
export function createAnalytics(deps: AnalyticsDeps) {
  let sdk: AnalyticsSdk | null = null;
  let instance: Analytics | null = null;
  let queue: Promise<void> = Promise.resolve();

  const setDisabledFlag = (disabled: boolean) => {
    if (deps.measurementId) (window as unknown as Record<string, unknown>)[`ga-disable-${deps.measurementId}`] = disabled;
  };

  async function apply(): Promise<void> {
    if (deps.isDev || !deps.measurementId) return;
    if (deps.consent() === "granted") {
      if (!instance) {
        try {
          const loaded = await deps.loadSdk();
          if (!(await loaded.isSupported())) return;
          sdk = loaded;
          instance = loaded.start();
        } catch {
          return; // blocked by the browser or an extension: analytics are optional
        }
      }
      // The choice may have changed while the SDK was loading.
      const on = deps.consent() === "granted";
      setDisabledFlag(!on);
      if (sdk && instance) sdk.setCollectionEnabled(instance, on);
      if (!on) deps.clearCookies();
    } else {
      setDisabledFlag(true);
      if (sdk && instance) sdk.setCollectionEnabled(instance, false);
      // A refusal also removes cookies an earlier "accept" left behind (even if this page never loaded the SDK).
      if (deps.consent() === "denied") deps.clearCookies();
    }
  }

  /** Brings analytics in line with the stored consent. Calls are run one after another. */
  const sync = (): Promise<void> => (queue = queue.then(apply, apply));

  return {
    sync,
    /** Starts following the consent: now, and whenever the person changes it. Returns the stop function. */
    watch(): () => void {
      void sync();
      return subscribeConsent(() => void sync());
    },
    /** True while events are really being sent. */
    get active(): boolean {
      return instance !== null && deps.consent() === "granted";
    },
    log(name: string, params: EventParams = {}): void {
      if (!sdk || !instance || deps.consent() !== "granted") return;
      sdk.logEvent(instance, name, params);
    },
  };
}

function deleteGoogleCookies(): void {
  const hostParts = window.location.hostname.split(".");
  const domains = ["", ...hostParts.map((_, i) => "." + hostParts.slice(i).join("."))];
  for (const cookie of document.cookie.split(";")) {
    const name = cookie.split("=")[0]?.trim();
    if (!name || !name.startsWith("_ga")) continue;
    for (const domain of domains) {
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/${domain ? `; domain=${domain}` : ""}`;
    }
  }
}

export const analytics = createAnalytics({
  // A preview build sends no events either: it is for looking, not for statistics.
  isDev: import.meta.env.DEV || writesDisabled(),
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || undefined,
  consent: currentConsent,
  clearCookies: deleteGoogleCookies,
  loadSdk: async () => {
    const [sdk, { app }] = await Promise.all([import("firebase/analytics"), import("./firebase")]);
    return {
      isSupported: sdk.isSupported,
      start: () => sdk.getAnalytics(app),
      logEvent: (a, name, params) => sdk.logEvent(a, name, params),
      setCollectionEnabled: sdk.setAnalyticsCollectionEnabled,
    };
  },
});

/** The five events of SETUP.md step 13, with their parameters. */
export const track = {
  signUp: (p: { method: "email" | "google" | "apple"; level: string; language: string }) => analytics.log("sign_up", p),
  firstStroke: (p: { cartridge: string }) => analytics.log("first_stroke", p),
  stencilTransfer: (p: { size_cm: number; threshold: number }) => analytics.log("stencil_transfer", p),
  workSaved: (p: { passes: number }) => analytics.log("work_saved", p),
  sessionEnd: (p: { duration_s: number; deviation_mm: number; trauma_level: string }) => analytics.log("session_end", p),
};
