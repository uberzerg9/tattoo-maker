import { IndexedDbStore } from "./workDb";
import { FirebaseRemote } from "./workRemote";
import { WorkSync } from "./WorkSync";

/** The works on this device. */
export const localStore = new IndexedDbStore();

/** One WorkSync for the app: saves go to the device first, then to the cloud. */
export const workSync = new WorkSync({
  local: localStore,
  remote: new FirebaseRemote(),
  isOnline: () => navigator.onLine,
});
