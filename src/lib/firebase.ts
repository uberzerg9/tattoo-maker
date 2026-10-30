import { initializeApp } from "firebase/app";
import { ReCaptchaEnterpriseProvider, initializeAppCheck } from "firebase/app-check";
import {
  browserLocalPersistence,
  browserPopupRedirectResolver,
  browserSessionPersistence,
  connectAuthEmulator,
  getAuth,
  initializeAuth,
} from "firebase/auth";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  connectFirestoreEmulator,
} from "firebase/firestore";
import { getStorage, connectStorageEmulator } from "firebase/storage";
import { getFunctions, connectFunctionsEmulator } from "firebase/functions";

const env = import.meta.env;

export const app = initializeApp({
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
  measurementId: env.VITE_FIREBASE_MEASUREMENT_ID,
});

const useEmulators = env.DEV && env.VITE_USE_EMULATORS === "true";

// App Check proves requests come from this app (reCAPTCHA Enterprise). It starts before any other service
// so their first requests carry a token. The emulators do not check it, so it stays off there.
function startAppCheck() {
  if (useEmulators) return;
  if (env.DEV) {
    // localhost: a debug token instead of reCAPTCHA. Use VITE_APPCHECK_DEBUG_TOKEN, or let the SDK print a new one in
    // the console, then register it under App Check > Manage debug tokens. Production builds drop this branch.
    (self as { FIREBASE_APPCHECK_DEBUG_TOKEN?: boolean | string }).FIREBASE_APPCHECK_DEBUG_TOKEN =
      env.VITE_APPCHECK_DEBUG_TOKEN || true;
  }
  const siteKey = env.VITE_RECAPTCHA_SITE_KEY || (env.DEV ? "debug" : "");
  if (!siteKey) {
    console.warn("App Check is off: VITE_RECAPTCHA_SITE_KEY is not set.");
    return;
  }
  initializeAppCheck(app, { provider: new ReCaptchaEnterpriseProvider(siteKey), isTokenAutoRefreshEnabled: true });
}
startAppCheck();

// Only the two persistences "Keep me logged in" chooses between. The default list also has IndexedDB,
// which migrates a stored user out of localStorage, so a logout in one tab left a copy behind.
function createAuth() {
  try {
    return initializeAuth(app, {
      persistence: [browserLocalPersistence, browserSessionPersistence],
      popupRedirectResolver: browserPopupRedirectResolver,
    });
  } catch {
    return getAuth(app); // already initialised (hot reload)
  }
}

export const auth = createAuth();
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager(),
  }),
});
export const storage = getStorage(app);
export const functions = getFunctions(app, "europe-west3");

if (useEmulators) {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
  connectStorageEmulator(storage, "127.0.0.1", 9199);
  connectFunctionsEmulator(functions, "127.0.0.1", 5001);
}
