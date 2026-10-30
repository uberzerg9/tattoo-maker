/**
 * Lists, and on request deletes, test accounts and everything they own, before the beta opens.
 * Run it by hand; nothing calls it. Needs Node 24 (it runs TypeScript directly).
 *
 *   node scripts/cleanup-test-data.ts --project tattoo-maker-82071              # list only (dry run)
 *   node scripts/cleanup-test-data.ts --project tattoo-maker-82071 --delete     # list, ask, delete
 *   node scripts/cleanup-test-data.ts --emulator --delete                        # the local emulators, no questions
 *
 * Which accounts count as test accounts: an email at example.com, example.net or example.org (reserved names, so a
 * real person never has one), or any address you pass with --email / any domain with --email-domain.
 * Deleting an account does what the deleteAccount Cloud Function does: users/{uid} and everything under it
 * (works, sketches, sessions), usernames/{name}, the Storage files under users/{uid}/, and the sign-in.
 *
 * Real projects: sign in first with `gcloud auth application-default login` (or set GOOGLE_APPLICATION_CREDENTIALS).
 */
import { createInterface } from "node:readline/promises";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import type { UserRecord } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

const HELP = `Usage: node scripts/cleanup-test-data.ts --project <id> | --emulator  [options]

  --project <id>        Firebase project to clean (required unless --emulator)
  --emulator            Use the local emulators (Auth 9099, Firestore 8080, Storage 9199) instead of a real project
  --delete              Delete what is listed (asks you to type the project id first; not needed with --emulator)
  --email <address>     Treat this exact address as a test account (repeatable)
  --email-domain <d>    Treat every address at this domain as test accounts (repeatable)
  --only-listed         Use only --email / --email-domain, not the example.* default
  --include-orphans     Also delete leftovers with no sign-in: users/ docs, usernames/ entries and Storage folders of accounts that no longer exist
  --bucket <name>       Storage bucket (default <project>.firebasestorage.app)
  --help                This text
`;

interface Options {
  project: string;
  emulator: boolean;
  doDelete: boolean;
  emails: Set<string>;
  domains: Set<string>;
  includeOrphans: boolean;
  bucket: string;
}

const DEFAULT_DOMAINS = ["example.com", "example.net", "example.org"];

function parseArgs(argv: string[]): Options {
  const emails = new Set<string>();
  const domains = new Set<string>();
  let project = "";
  let emulator = false;
  let doDelete = false;
  let onlyListed = false;
  let includeOrphans = false;
  let bucket = "";
  const need = (i: number, flag: string) => {
    const value = argv[i + 1];
    if (!value || value.startsWith("--")) fail(`${flag} needs a value`);
    return value;
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--help" || arg === "-h") {
      console.log(HELP);
      process.exit(0);
    } else if (arg === "--project") project = need(i++, arg);
    else if (arg === "--emulator") emulator = true;
    else if (arg === "--delete") doDelete = true;
    else if (arg === "--email") emails.add(need(i++, arg).toLowerCase());
    else if (arg === "--email-domain") domains.add(need(i++, arg).toLowerCase().replace(/^@/, ""));
    else if (arg === "--only-listed") onlyListed = true;
    else if (arg === "--include-orphans") includeOrphans = true;
    else if (arg === "--bucket") bucket = need(i++, arg);
    else fail(`Unknown option ${arg}\n\n${HELP}`);
  }
  if (!emulator && !project) fail(`Say which project: --project <id>, or --emulator.\n\n${HELP}`);
  if (emulator && !project) project = "tattoo-maker-82071";
  if (!onlyListed) for (const d of DEFAULT_DOMAINS) domains.add(d);
  return { project, emulator, doDelete, emails, domains, includeOrphans, bucket: bucket || `${project}.firebasestorage.app` };
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

const isTestAccount = (user: UserRecord, o: Options) => {
  const email = user.email?.toLowerCase();
  if (!email) return false;
  return o.emails.has(email) || o.domains.has(email.split("@")[1] ?? "");
};

async function allUsers(): Promise<UserRecord[]> {
  const users: UserRecord[] = [];
  let pageToken: string | undefined;
  do {
    const page = await getAuth().listUsers(1000, pageToken);
    users.push(...page.users);
    pageToken = page.pageToken;
  } while (pageToken);
  return users;
}

interface Account {
  uid: string;
  email: string;
  created: string;
  username: string | null;
  works: number;
  sketches: number;
  sessions: number;
  files: number;
}

async function describe(user: UserRecord, o: Options): Promise<Account> {
  const db = getFirestore();
  const profile = await db.doc(`users/${user.uid}`).get();
  const count = async (name: string) => (await db.collection(`users/${user.uid}/${name}`).count().get()).data().count;
  const [files] = await getStorage().bucket(o.bucket).getFiles({ prefix: `users/${user.uid}/` });
  return {
    uid: user.uid,
    email: user.email ?? "",
    created: user.metadata.creationTime,
    username: (profile.get("username") as string | undefined) ?? null,
    works: await count("works"),
    sketches: await count("sketches"),
    sessions: await count("sessions"),
    files: files.length,
  };
}

/** What is left behind by accounts that no longer have a sign-in. */
async function findOrphans(users: UserRecord[], o: Options) {
  const db = getFirestore();
  const live = new Set(users.map((u) => u.uid));
  const profiles = (await db.collection("users").select().get()).docs.map((d) => d.id).filter((id) => !live.has(id));
  const names = (await db.collection("usernames").get()).docs.filter((d) => !live.has(d.get("uid") as string)).map((d) => d.id);
  const [files] = await getStorage().bucket(o.bucket).getFiles({ prefix: "users/" });
  const folders = [...new Set(files.map((f) => f.name.split("/")[1]).filter((id): id is string => !!id && !live.has(id)))];
  return { profiles, names, folders };
}

/** The same steps as the deleteAccount Cloud Function. */
async function deleteAccount(a: Account, o: Options): Promise<void> {
  const db = getFirestore();
  await db.recursiveDelete(db.doc(`users/${a.uid}`));
  if (a.username) await db.doc(`usernames/${a.username}`).delete();
  await getStorage().bucket(o.bucket).deleteFiles({ prefix: `users/${a.uid}/` });
  await getAuth().deleteUser(a.uid);
}

async function ask(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await rl.question(question)).trim();
  } finally {
    rl.close();
  }
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  if (o.emulator) {
    process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
    process.env.FIREBASE_AUTH_EMULATOR_HOST ??= "127.0.0.1:9099";
    process.env.FIREBASE_STORAGE_EMULATOR_HOST ??= "127.0.0.1:9199";
  }
  initializeApp({ projectId: o.project, storageBucket: o.bucket });

  console.log(`\nTarget: ${o.emulator ? "EMULATORS" : "REAL PROJECT"} ${o.project}`);
  console.log(`Test accounts: emails at ${[...o.domains].join(", ") || "(none)"}${o.emails.size ? `, plus ${[...o.emails].join(", ")}` : ""}\n`);

  const users = await allUsers();
  const tests = users.filter((u) => isTestAccount(u, o));
  const accounts = await Promise.all(tests.map((u) => describe(u, o)));
  const orphans = await findOrphans(users, o);

  console.log(`${users.length} accounts in total, ${accounts.length} look like test accounts:`);
  if (accounts.length > 0) console.table(accounts.map(({ email, username, works, sketches, sessions, files, created, uid }) => ({ email, username, works, sketches, sessions, files, created, uid })));
  const orphanCount = orphans.profiles.length + orphans.names.length + orphans.folders.length;
  console.log(`Leftovers without a sign-in: ${orphans.profiles.length} profiles, ${orphans.names.length} usernames, ${orphans.folders.length} Storage folders${o.includeOrphans ? " (will be deleted)" : orphanCount ? " (kept; add --include-orphans to delete)" : ""}.`);

  if (!o.doDelete) {
    console.log("\nDry run: nothing was changed. Add --delete to remove what is listed.");
    return;
  }
  if (accounts.length === 0 && !(o.includeOrphans && orphanCount > 0)) {
    console.log("\nNothing to delete.");
    return;
  }
  if (!o.emulator) {
    const answer = await ask(`\nThis deletes the accounts above and ALL their data in ${o.project}, for good. Type the project id to confirm: `);
    if (answer !== o.project) fail("Not confirmed. Nothing was changed.");
  }

  for (const a of accounts) {
    await deleteAccount(a, o);
    console.log(`deleted ${a.email} (${a.uid})`);
  }
  if (o.includeOrphans) {
    const db = getFirestore();
    for (const id of orphans.profiles) await db.recursiveDelete(db.doc(`users/${id}`));
    for (const name of orphans.names) await db.doc(`usernames/${name}`).delete();
    for (const id of orphans.folders) await getStorage().bucket(o.bucket).deleteFiles({ prefix: `users/${id}/` });
    console.log(`deleted ${orphanCount} leftovers`);
  }
  console.log("\nDone.");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
