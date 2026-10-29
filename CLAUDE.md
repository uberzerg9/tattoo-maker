Tattoo Trainer (tattoo-maker)

Web trainer for beginner tattoo artists: pick a cartridge, ink cap and machine speed, transfer a sketch to a sheet of practice skin as a stencil, tattoo it and get numeric feedback (deviation from stencil, passes, skin trauma).

Source of truth
docs/SPEC.md — MVP technical spec (scope, screens, engine, data model, NFRs, stages, acceptance criteria).
docs/SETUP.md — step-by-step setup: Firebase, auth, rules, functions, i18n, engine, emulators, CI.
Read both before starting a task. If code and docs disagree, ask before changing either.
Stack
Vite + React 18 + TypeScript (strict), Zustand, react-router-dom, i18next (EN default, RU, RO).
Engine: WebGL2 via twgl.js + custom shaders in src/engine/. Must not import React — UI talks to it only through the TattooEngine interface (SETUP.md step 10).
Stencil processing: OpenCV.js (@techstark/opencv-js) in a Web Worker, lazy-loaded.
Firebase: Auth (email, Google, Apple), Firestore, Cloud Storage, Cloud Functions v2, Hosting. Region europe-west3 for everything.
Tests: Vitest, @firebase/rules-unit-testing, Playwright — all against the emulators.
Actual environment (differs from docs)
Project folder: tattoo-maker (docs say tattoo-trainer).
Only one Firebase project so far: tattoo-maker-82071, alias dev (+ default). No prod yet — skip anything with firebase use prod.
Hosting emulator runs on 5050 (5000 is taken by macOS AirPlay).
Emulators need JDK 21+.
functions/ installs only with legacy peer deps: functions/.npmrc contains legacy-peer-deps=true. Don't remove it until the peer conflict is fixed.
functions/ uses ESLint 9 flat config (functions/eslint.config.mjs), lint script eslint .. Root eslint.config.js ignores functions.
Commands
npm run emulators — start Firebase emulators (UI at http://127.0.0.1:4000)
npm run dev — Vite on http://localhost:5173 (needs VITE_USE_EMULATORS=true in .env.local)
npm test, npm run e2e
firebase emulators:exec "npm test && npm run e2e"
firebase deploy --only firestore,storage,functions / firebase deploy --only hosting
Rules
All UI strings go through i18next; never hardcode text. Keep en.json, ru.json, ro.json key sets identical.
Numbers and dates via Intl with the current language.
Never write stats, username or createdAt on users/{uid} from the client; sessions are create-only.
Don't deploy to Firebase or change Security Rules in the console without asking first.
Visual style: punk / Y2K / skate — dark grip-tape background, sticker panels with 3px black border and hard shadow, accents lime
#C8FF2E, pink
#FF4FB0, blue
#4D6BFF, yellow
#FFE14D, lilac
#C9B8FF; fonts Unbounded (headings) and Rubik (body). Reference mockups in docs/design/ if present.
