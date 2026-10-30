# Closed beta checklist

Work through this before the first tester is invited. It is the "before the beta" list from `docs/SETUP.md`, extended with what stages 3–5 added. Tick a box only when you have checked it on the real project, not on the emulators.

"Repo" notes say what the code already does; the box is for the part a person still has to do.

## Project and billing

- [ ] Projects are on Blaze and budget alerts are set.
  - Repo: there is one Firebase project today, `tattoo-maker-82071`; `.firebaserc` points `default`, `dev` and `prod` at it. Decide whether to split before the beta; if you do, change only `prod` in `.firebaserc`.
- [ ] Firestore, Storage and Functions are all in `europe-west3`.
- [ ] **Firestore backups / PITR enabled.**
  - Turn on point-in-time recovery (7 days) and a scheduled backup, in the console under Firestore → Disaster recovery, or with `gcloud firestore databases update --database='(default)' --enable-pitr` and `gcloud firestore backups schedules create --database='(default)' --recurrence=daily --retention=14w` (check the flags against the current gcloud docs).
  - Consider object versioning or soft delete on the Storage bucket too: works live there.
  - Write the real retention periods into the privacy text (`[Backup retention …]` in `legal.privacy.sections.keep`), and tell testers that deleted data stays in backups until they expire.

## Security

- [ ] Security rules for Firestore and Storage are deployed (`firebase deploy --only firestore:rules,storage`, or by tagging a release) and `npm run test:rules` is green.
- [ ] App Check is set up: a reCAPTCHA Enterprise key for the real domain in `VITE_RECAPTCHA_SITE_KEY`. Watch the metrics for a week, then set it to **Enforce** for Firestore, Storage and Functions. (`deleteAccount` already enforces it in the Functions code.)
- [ ] **Debug App Check tokens removed.**
  - Console → App Check → Apps → Manage debug tokens: delete every token.
  - Make sure no `VITE_APPCHECK_DEBUG_TOKEN` is set in a CI secret or an `.env` file that reaches a production build. (Production builds drop the debug branch of `src/lib/firebase.ts`, but a leftover registered token is still a hole.)
- [ ] The security headers are live. After the first Hosting deploy, `curl -I` the site and the `stencil.worker-*.js` file and check `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` and the `Content-Security-Policy-Report-Only` header (the worker file should be the one that allows `'unsafe-eval'`).
- [ ] The CSP has run in report-only mode against the real site for a while with no unexpected violations; then rename the header to `Content-Security-Policy` in `firebase.json`.

## Accounts and sign-in

- [ ] Email/password and Google sign-in work on the production domain (add it under Authentication → Settings → Authorized domains). Apple only if the developer account exists (`VITE_FEATURE_APPLE_SIGNIN`).
- [ ] Verification and password-reset emails are translated into EN / RU / RO in the Authentication templates (the app sets `auth.languageCode` to the interface language).
- [ ] Sign-up → verify → log out → log in → reset password has been done once by hand on the real project.

## Data

- [ ] Cartridge presets are checked by the consultant and loaded into the real project.
- [ ] Statistics recalculation and account deletion are verified on the real project (deleting an account leaves no user, docs, username or Storage files behind).
- [ ] **Test data removed.** Dry run first, then delete:
  - `npm run cleanup:test-data -- --project tattoo-maker-82071` (lists the accounts at example.com/.net/.org and what they own, changes nothing)
  - `npm run cleanup:test-data -- --project tattoo-maker-82071 --delete` (asks you to type the project id)
  - It needs `gcloud auth application-default login` first. Accounts of real people on other domains are never listed unless you pass `--email` or `--email-domain`.

## Product

- [ ] Analytics: with the consent banner accepted, the five events (`sign_up`, `first_stroke`, `stencil_transfer`, `work_saved`, `session_end`) show up in GA4 DebugView; with it rejected, nothing is sent and no `_ga` cookies are set. Mark `sign_up` and `session_end` as key events.
- [ ] Terms and Privacy: the drafts are replaced after legal review. Fill in everything in `[square brackets]` (operator name and address, age limits, liability and governing law, legal bases, transfers, retention) and set `VITE_CONTACT_EMAIL`. The "DRAFT — NEEDS LEGAL REVIEW" box comes out of `legal.draftTitle` / `legal.draftText` only when the text is final.
- [ ] The RU and RO texts (interface, consent banner, legal drafts, onboarding) have been read by native speakers.
- [ ] On a browser without WebGL 2 the "your browser can't run the trainer" screen appears. (The e2e suite simulates this; try it once on a real old browser or device.)

## CI/CD

- [ ] GitHub repository secrets are set (see below) and the `prod` environment has required reviewers.
- [ ] Branch protection on `main` requires the "Checks" jobs.
- [ ] A pull request got a preview channel, and the preview shows "Preview — saving disabled".
- [ ] The first release tag (`v0.1.0` on a commit that is on `main`) was watched end to end.

## How a release is made

1. Merge to `main`. The same checks as on a pull request run; nothing is deployed.
2. Tag a commit on `main`: `git tag v0.1.0 && git push origin v0.1.0`.
3. The `Release` workflow runs all checks again, waits for approval on the `prod` environment, builds with saving on, and deploys Hosting, Firestore rules and indexes, Storage rules and Functions with `firebase deploy --project prod`.

A pull request deploys only a Hosting preview channel (`pr<number>`, removed after 7 days). It is built with `VITE_DISABLE_WRITES=true`, so it shows a badge, cannot save, rename, delete, sign up or change an account, and sends no analytics. Preview URLs are not authorized domains for Google sign-in and are not registered with App Check, so on a preview use an existing email/password account (and expect it to be blocked once App Check is enforced).

## GitHub secrets

| Secret | What it is |
| --- | --- |
| `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID`, `VITE_FIREBASE_MEASUREMENT_ID` | The web app config from the Firebase console (not private, but kept with the other settings). |
| `VITE_RECAPTCHA_SITE_KEY` | reCAPTCHA Enterprise site key for App Check. |
| `VITE_CONTACT_EMAIL` | The address shown in the Terms and Privacy pages. |
| `FIREBASE_SERVICE_ACCOUNT_PREVIEW` | Service account JSON with only the **Firebase Hosting Admin** role. Pull requests run code from their branch, so keep this one weak. |
| `FIREBASE_SERVICE_ACCOUNT_RELEASE` | Service account JSON that can deploy Hosting, Firestore rules and indexes, Storage rules and Functions (Firebase Admin plus Cloud Functions Admin and Service Account User). Only the `prod` environment should be able to read it: put it in the environment's secrets, not the repository's. |
