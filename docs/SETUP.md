# Установка и настройка

Пошаговый гайд: от пустой папки до задеплоенного MVP на Firebase. Команды для macOS и Linux; на Windows те же через PowerShell.

## Что нужно заранее

| Что | Зачем |
| --- | --- |
| Node.js 20 LTS и npm | Сборка, Firebase CLI, Cloud Functions (runtime nodejs20) |
| Git + репозиторий на GitHub | Код и CI через GitHub Actions |
| Google-аккаунт | Firebase Console |
| JDK 21+ (macOS: brew install openjdk@21) | Нужна эмулятору Firestore |
| Apple Developer Program (99 $ в год) | Только для «Sign in with Apple»; можно отложить до беты |
| Тариф Firebase Blaze + бюджетный алерт | Cloud Functions и Cloud Storage в новых проектах работают только на Blaze; на объёмах MVP бесплатные квоты покрывают почти всё |

Установи Firebase CLI и войди:

```bash
npm install -g firebase-tools
firebase login
firebase --version
```

## Шаг 1. Создание проекта и зависимости

1. Создай проект на Vite с шаблоном React + TypeScript:

```bash
npm create vite@latest tattoo-trainer -- --template react-ts
cd tattoo-trainer
git init
```

2. Поставь зависимости приложения:

```bash
npm install firebase react-router-dom zustand \
  i18next react-i18next i18next-browser-languagedetector \
  twgl.js @techstark/opencv-js
```

3. Поставь инструменты разработки:

```bash
npm install -D vitest @testing-library/react jsdom \
  @playwright/test eslint prettier
npx playwright install chromium
```

4. Включи строгий TypeScript: в `tsconfig.app.json` должны быть `"strict": true` и `"noUncheckedIndexedAccess": true`.
5. Добавь скрипты в `package.json`:

```json


```

## Шаг 2. Структура папок

Движок лежит в отдельной папке `src/engine` и не импортирует ничего из React. Это правило стоит закрепить линтером (`no-restricted-imports`).

```text
tattoo-trainer/
├─ src/
│  ├─ app/            # роутинг, провайдеры, guard авторизации
│  ├─ pages/          # Login, Signup, Profile, Workspace
│  ├─ features/       # panels/, stencil/, profile/
│  ├─ engine/         # WebGL2: buffers/, brushes/, scoring/, shaders/
│  │  └─ presets/     # cartridges.json — параметры картриджей
│  ├─ workers/        # stencil.worker.ts (OpenCV)
│  ├─ lib/            # firebase.ts, analytics.ts
│  ├─ store/          # Zustand-сторы
│  └─ i18n/           # index.ts + locales/en.json, ru.json, ro.json
├─ functions/         # Cloud Functions (TypeScript)
├─ e2e/               # Playwright
├─ firestore.rules
├─ firestore.indexes.json
├─ storage.rules
├─ firebase.json
├─ .firebaserc
└─ .env.local         # не коммитится
```

## Шаг 3. Проекты Firebase и окружения

Два отдельных проекта: `tattoo-trainer-dev` для разработки и `tattoo-trainer-prod` для беты. Так тестовые данные никогда не попадут к пользователям.

1. В [Firebase Console](https://console.firebase.google.com) нажми **Add project** и создай `tattoo-trainer-dev`. Google Analytics — включить.
2. Повтори для `tattoo-trainer-prod`.
3. В каждом проекте: **Project settings → Usage and billing** → переведи на **Blaze**. Сразу задай бюджетный алерт в Google Cloud Billing, например 10 $ в месяц.
4. В каждом проекте: **Project overview → Add app → Web** (`</>`), имя `web`. Firebase Hosting на этом шаге не отмечай — настроим через CLI. Сохрани объект `firebaseConfig`.
5. Регион для Firestore, Storage и Functions — `europe-west3` (Франкфурт). Регион Firestore потом поменять нельзя.
6. В папке проекта инициализируй Firebase и привяжи оба проекта:

```bash
firebase init
# выбери: Firestore, Functions, Hosting, Storage, Emulators
# Functions: TypeScript, ESLint — да
# Hosting: public directory = dist, single-page app = yes,
#          GitHub automatic deploys — пока нет (сделаем в шаге 12)
# Emulators: Auth, Firestore, Functions, Storage, Hosting

firebase use --add   # tattoo-trainer-dev  → alias dev
firebase use --add   # tattoo-trainer-prod → alias prod
firebase use dev
```

## Шаг 4. Подключение Firebase SDK

1. Перенеси `firebaseConfig` в переменные окружения. Для dev — `.env.local`, для prod — `.env.production` (оба в `.gitignore`, в CI значения идут из GitHub Secrets):

```bash
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=tattoo-trainer-dev.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=tattoo-trainer-dev
VITE_FIREBASE_STORAGE_BUCKET=tattoo-trainer-dev.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
VITE_FIREBASE_MEASUREMENT_ID=G-...
VITE_USE_EMULATORS=true
```

2. Создай `src/lib/firebase.ts` — единственное место, где инициализируется Firebase:

```typescript
import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  connectFirestoreEmulator,
} from 'firebase/firestore';
import { getStorage, connectStorageEmulator } from 'firebase/storage';
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions';

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

export const auth = getAuth(app);
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});
export const storage = getStorage(app);
export const functions = getFunctions(app, 'europe-west3');

if (env.DEV && env.VITE_USE_EMULATORS === 'true') {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  connectStorageEmulator(storage, '127.0.0.1', 9199);
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
}
```

`persistentLocalCache` даёт офлайн-кэш Firestore в IndexedDB: если сеть пропала, записи сессий и работ уйдут на сервер после восстановления. Снимки буферов движок сохраняет в IndexedDB сам и догружает в Storage.

## Шаг 5. Authentication

1. **Authentication → Get started → Sign-in method** → включи **Email/Password**.
2. Включи **Google**: укажи support email, больше ничего не нужно.
3. Включи **Apple** (можно позже):
   1. В Apple Developer создай App ID с включённым Sign in with Apple, затем **Services ID** (он станет client ID для веба).
   2. В Services ID добавь домен `tattoo-trainer-prod.firebaseapp.com` и return URL `https://tattoo-trainer-prod.firebaseapp.com/__/auth/handler`.
   3. Создай **Key** с Sign in with Apple, скачай `.p8`.
   4. В Firebase у провайдера Apple заполни Services ID, Team ID, Key ID и приватный ключ.
4. **Authentication → Settings → Authorized domains** — добавь свой домен, когда он будет. `localhost` там уже есть.
5. **Authentication → Templates** — переведи письма подтверждения и сброса пароля; язык письма берётся из `auth.languageCode`.
6. Регистрация в коде: создать аккаунт, затем в одной транзакции занять username и создать профиль:

```typescript
import { createUserWithEmailAndPassword, sendEmailVerification } from 'firebase/auth';
import { doc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';

export async function signUp(p: {
  email: string; password: string; name: string; username: string;
  level: 'never' | 'fake' | 'apprentice'; language: 'en' | 'ru' | 'ro';
}) {
  const { user } = await createUserWithEmailAndPassword(auth, p.email, p.password);
  const handle = p.username.toLowerCase();
  await runTransaction(db, async (tx) => {
    const nameRef = doc(db, 'usernames', handle);
    if ((await tx.get(nameRef)).exists()) throw new Error('username-taken');
    tx.set(nameRef, { uid: user.uid });
    tx.set(doc(db, 'users', user.uid), {
      name: p.name, username: handle, level: p.level, language: p.language,
      createdAt: serverTimestamp(),
      settings: { skinTone: 't2', machineHz: 85, units: 'cm' },
    });
  });
  auth.languageCode = p.language;
  await sendEmailVerification(user);
}
```

Если username занят, аккаунт уже создан — просим выбрать другой на том же экране, а не пересоздаём аккаунт. Для Google / Apple тот же шаг с username показываем после первого входа (`signInWithPopup`), если `users/{uid}` ещё нет.

## Шаг 6. Firestore

1. **Firestore Database → Create database** → Production mode → регион `europe-west3`.
2. Правила в `firestore.rules`. Пользователь работает только со своим `users/{uid}`; `stats`, `username` и `createdAt` менять не может; сессии только создаёт, чтобы не подкручивать статистику.

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function signedIn() { return request.auth != null; }
    function isOwner(uid) { return signedIn() && request.auth.uid == uid; }

    match /users/{uid} {
      allow read: if isOwner(uid);
      allow create: if isOwner(uid) && !('stats' in request.resource.data);
      allow update: if isOwner(uid) && !request.resource.data.diff(resource.data)
        .affectedKeys().hasAny(['stats', 'username', 'createdAt']);
      allow delete: if false; // только через функцию удаления аккаунта

      match /sketches/{id} { allow read, write: if isOwner(uid); }
      match /works/{id}    { allow read, write: if isOwner(uid); }
      match /sessions/{id} {
        allow read, create: if isOwner(uid);
        allow update, delete: if false;
      }
    }

    match /usernames/{name} {
      allow read: if signedIn();
      allow create: if signedIn()
        && request.resource.data.uid == request.auth.uid
        && name.matches('^[a-z0-9_]{3,20}$');
      allow update, delete: if false;
    }

    match /cartridgePresets/{id} {
      allow read: if signedIn();
      allow write: if false; // правится из консоли или админ-скриптом
    }
  }
}
```

3. Составные индексы для MVP не нужны: списки работ и сессий сортируются по одному полю (`updatedAt`, `startedAt`). `firestore.indexes.json` оставляем пустым.
4. Залей пресеты картриджей из `src/engine/presets/cartridges.json` в `cartridgePresets` скриптом на Admin SDK (`scripts/seed-presets.ts`). Движок читает пресеты из Firestore, а если они недоступны — из JSON в сборке.
5. Выложи правила:

```bash
firebase deploy --only firestore:rules,firestore:indexes
```

## Шаг 7. Cloud Storage

1. **Storage → Get started** → Production mode → регион `europe-west3`.
2. Структура путей: `users/{uid}/sketches/{id}/original.png`, `.../stencil.png`, `users/{uid}/works/{id}/ink.bin`, `.../trauma.bin`, `.../preview.webp`.
3. Правила в `storage.rules`: только свои файлы, эскизы — только картинки до 10 МБ, буферы — до 25 МБ.

```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    function isOwner(uid) { return request.auth != null && request.auth.uid == uid; }

    match /users/{uid}/sketches/{id}/{file} {
      allow read: if isOwner(uid);
      allow write: if isOwner(uid)
        && request.resource.size < 10 * 1024 * 1024
        && request.resource.contentType.matches('image/(png|jpeg|webp)');
    }

    match /users/{uid}/works/{id}/{file} {
      allow read: if isOwner(uid);
      allow write: if isOwner(uid) && request.resource.size < 25 * 1024 * 1024;
    }
  }
}
```

4. Выложи:

```bash
firebase deploy --only storage
```

Буферы 2048 × 1536 в float16 весят много, поэтому перед загрузкой сжимай их через `CompressionStream('gzip')` — на почти пустом листе это уменьшает файл в разы.

## Шаг 8. Cloud Functions

Две функции в `functions/src/index.ts`: пересчёт статистики после каждой сессии и удаление аккаунта. Регион функций совпадает с регионом Firestore.

```typescript
import { setGlobalOptions } from 'firebase-functions/v2';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { getAuth } from 'firebase-admin/auth';

initializeApp();
setGlobalOptions({ region: 'europe-west3', maxInstances: 10 });
const db = getFirestore();

const dayOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export const onSessionCreated = onDocumentCreated(
  'users/{uid}/sessions/{sid}',
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const userRef = db.doc(`users/${event.params.uid}`);

    await db.runTransaction(async (tx) => {
      const session = await tx.get(snap.ref);
      if (session.get('counted')) return; // событие может прийти дважды

      const s = session.data()!;
      const user = await tx.get(userRef);
      const st = user.get('stats') ?? { sessions: 0, hours: 0, avgDeviationMm: 0, streakDays: 0, lastDay: null };

      const start = s.startedAt.toMillis();
      const n = st.sessions + 1;
      const today = dayOf(start);
      const yesterday = dayOf(start - 864e5);
      const streak = st.lastDay === today ? st.streakDays
        : st.lastDay === yesterday ? st.streakDays + 1 : 1;

      tx.update(userRef, {
        stats: {
          sessions: n,
          hours: st.hours + (s.endedAt.toMillis() - start) / 36e5,
          avgDeviationMm: (st.avgDeviationMm * st.sessions + s.deviationMm) / n,
          streakDays: streak,
          lastDay: today,
        },
      });
      tx.update(snap.ref, { counted: true });
    });
  },
);

export const deleteAccount = onCall(async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in first');
  const user = await db.doc(`users/${uid}`).get();
  const username = user.get('username');
  await db.recursiveDelete(db.doc(`users/${uid}`));
  if (username) await db.doc(`usernames/${username}`).delete();
  await getStorage().bucket().deleteFiles({ prefix: `users/${uid}/` });
  await getAuth().deleteUser(uid);
});
```

Выложи функции:

```bash
cd functions && npm run build && cd ..
firebase deploy --only functions
```

На клиенте удаление аккаунта — `httpsCallable(functions, 'deleteAccount')()` после повторного ввода пароля, затем `signOut`.

## Шаг 9. Локализация

1. Строки — в `src/i18n/locales/{en,ru,ro}.json`, ключи по экранам: `workspace.carts.title`, `auth.login.submit` и т.д. Источник правды — `en.json`.
2. Инициализация в `src/i18n/index.ts`:

```typescript
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import en from './locales/en.json';
import ru from './locales/ru.json';
import ro from './locales/ro.json';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: { en: { translation: en }, ru: { translation: ru }, ro: { translation: ro } },
    supportedLngs: ['en', 'ru', 'ro'],
    fallbackLng: 'en',
    detection: { order: ['localStorage', 'navigator'], caches: ['localStorage'] },
    interpolation: { escapeValue: false },
  });

export default i18n;
```

3. После входа язык из `users/{uid}.language` имеет приоритет: `i18n.changeLanguage(profile.language)`, там же `auth.languageCode = profile.language` для писем.
4. При смене языка в Profile — `changeLanguage` + `updateDoc(users/{uid}, { language })`, интерфейс перерисовывается без перезагрузки.
5. Числа: `new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 1 }).format(0.6)` → `0.6` / `0,6`.
6. Проверка полноты: тест в Vitest сравнивает наборы ключей трёх файлов и падает, если в ru или ro чего-то не хватает.

## Шаг 10. Движок и воркер стенсила

1. Проверка поддержки при старте Workspace: `canvas.getContext('webgl2')` и расширение `EXT_color_buffer_float` (без него нельзя рисовать в RGBA16F). Если чего-то нет — экран «Браузер не поддерживается», а не чёрный канвас.
2. Публичный API движка — единственная точка контакта с React:

```typescript
export interface TattooEngine {
  mount(canvas: HTMLCanvasElement): void;
  destroy(): void;
  setCartridge(id: CartridgeId): void;
  setInk(capId: InkCapId): void;
  dip(): void;
  setMachineHz(hz: number): void;
  setSkinTone(hex: string): void;
  setView(v: { zoom: number; offsetX: number; offsetY: number; rotationDeg: number }): void;
  setStencil(mask: ImageBitmap, distanceField: Float32Array): void;
  setRenderMode(mode: 'fresh' | 'healed'): void;
  pointer(e: PointerEvent): void;   // UI пробрасывает сырые события
  undo(): void;
  snapshot(): Promise<{ ink: Blob; trauma: Blob; preview: Blob }>;
  restore(s: { ink: Blob; trauma: Blob }): Promise<void>;
  on(event: 'score', cb: (s: Score) => void): () => void;
  on(event: 'inkLevel', cb: (pct: number) => void): () => void;
}
```

3. Воркер стенсила подключается средствами Vite и грузится только при открытии диалога — OpenCV.js весит несколько мегабайт и не должен тормозить первую загрузку:

```typescript
const worker = new Worker(
  new URL('../workers/stencil.worker.ts', import.meta.url),
  { type: 'module' },
);
worker.postMessage({ bitmap, threshold, lineWeight, removeFills }, [bitmap]);
worker.onmessage = (e) => engine.setStencil(e.data.mask, e.data.distanceField);
```

4. В воркере: градации серого → `cv.threshold` или `cv.Canny` → удаление заливок морфологией → утолщение до `lineWeight` → `cv.distanceTransform` для distance field. Каждый `cv.Mat` освобождай через `.delete()`, иначе память wasm течёт.
5. Пресеты картриджей и пороги оценки — в `cartridges.json` с полем `version`; движок сохраняет версию пресетов в работе, чтобы старые работы открывались одинаково.

## Шаг 11. Локальная разработка и тесты

Вся разработка идёт на Firebase Emulator Suite — без записей в настоящий проект и без трат на Blaze.

1. Порты эмуляторов в `firebase.json` (совпадают с `firebase.ts`):

```json
"emulators": {
  "auth": { "port": 9099 },
  "firestore": { "port": 8080 },
  "functions": { "port": 5001 },
  "storage": { "port": 9199 },
  "hosting": { "port": 5050 },
  "ui": { "enabled": true, "port": 4000 }
}
```

2. Запуск в двух терминалах:

```bash
# терминал 1 — эмуляторы, данные сохраняются между запусками
npm run emulators

# терминал 2 — фронт
npm run dev
```

3. Emulator UI — `http://127.0.0.1:4000`: там видны тестовые пользователи, документы, файлы и логи функций. Вход через Google в эмуляторе работает с фейковым аккаунтом, настоящий Google не нужен.

| Тесты | Инструмент | Что проверяем |
| --- | --- | --- |
| Логика движка | Vitest | Плотность штампов от частоты и скорости, пересчёт координат при зуме и повороте, расчёт отклонения |
| Правила доступа | `@firebase/rules-unit-testing` + эмулятор | Чужой uid не читает работы; `stats` не пишется с клиента; username нельзя занять дважды |
| Функции | Vitest + эмулятор | Повторное событие не считает сессию дважды; серия дней считается верно |
| Сквозные сценарии | Playwright + эмулятор | Sign up → стенсил → штрих → сохранение → работа в Profile; смена языка |

Тесты с эмулятором запускаются одной командой: `firebase emulators:exec "npm test && npm run e2e"`.

## Шаг 12. Деплой и CI

1. Настройка Hosting в `firebase.json`: SPA-редирект на `index.html` и долгий кэш для ассетов с хэшем в имени:

```json
"hosting": {
  "public": "dist",
  "ignore": ["firebase.json", "**/.*"],
  "rewrites": [{ "source": "**", "destination": "/index.html" }],
  "headers": [{
    "source": "/assets/**",
    "headers": [{ "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }]
  }]
}
```

2. Первый ручной деплой в dev:

```bash
firebase use dev
npm run build -- --mode development
firebase deploy
```

3. CI через GitHub Actions:

```bash
firebase init hosting:github
```

Команда создаст сервисный аккаунт, секрет `FIREBASE_SERVICE_ACCOUNT_*` в репозитории и два workflow:

- `firebase-hosting-pull-request.yml` — на каждый PR деплой в preview channel со своей ссылкой в комментарии к PR (канал живёт 7 дней).
- `firebase-hosting-merge.yml` — на merge в `main` деплой в live.

4. Дополни оба workflow до шага деплоя: `npm ci`, тесты в эмуляторе, сборка с переменными из GitHub Secrets (`VITE_FIREBASE_*` для dev и prod). Merge-workflow также выкатывает правила и функции: `firebase deploy --only firestore,storage,functions`.
5. Prod выкатываем по тегу релиза (отдельный workflow на `push: tags: ['v*']` c `firebase use prod`), а не на каждый merge.
6. Свой домен: **Hosting → Add custom domain**, добавь DNS-записи у регистратора. После этого домен нужно добавить в Authorized domains (шаг 5) и в Services ID у Apple.

## Шаг 13. Аналитика и App Check

**Аналитика (Google Analytics for Firebase):**

1. Обёртка в `src/lib/analytics.ts`: `getAnalytics(app)` только если `await isSupported()` и пользователь согласился на аналитические cookies (GDPR). В dev аналитика выключена.
2. События через `logEvent`:

| Событие | Когда | Параметры |
| --- | --- | --- |
| `sign_up` | аккаунт создан | method, level, language |
| `first_stroke` | первый штрих в работе | cartridge |
| `stencil_transfer` | стенсил перенесён | size\_cm, threshold |
| `work_saved` | ручное сохранение | passes |
| `session_end` | выход из Workspace | duration\_s, deviation\_mm, trauma\_level |

3. В GA4 пометь `sign_up` и `session_end` как ключевые события; возврат на вторую сессию смотреть в отчёте удержания.

**App Check** — защищает Firestore, Storage и Functions от запросов не из нашего приложения:

1. **App Check → Apps → web** → провайдер reCAPTCHA Enterprise, создай ключ сайта для своего домена.
2. В `firebase.ts` после `initializeApp`: `initializeAppCheck(app, { provider: new ReCaptchaEnterpriseProvider(SITE_KEY), isTokenAutoRefreshEnabled: true })`.
3. Для localhost — debug-токен: `self.FIREBASE_APPCHECK_DEBUG_TOKEN = true` в dev, токен из консоли браузера добавь в **App Check → Manage debug tokens**.
4. Неделю смотри метрики в режиме мониторинга, потом включай **Enforce** для Firestore, Storage и Functions.

## Чек-лист перед бетой

- [ ] Оба проекта на Blaze, бюджетные алерты настроены.
- [ ] Firestore, Storage и Functions — в `europe-west3`.
- [ ] Security Rules для Firestore и Storage выложены, тесты правил зелёные.
- [ ] Email/Password и Google работают на prod-домене; Apple — если аккаунт разработчика есть.
- [ ] Письма подтверждения и сброса пароля переведены на EN / RU / RO.
- [ ] Пресеты картриджей проверены консультантом и залиты в prod.
- [ ] Пересчёт статистики и удаление аккаунта проверены на prod.
- [ ] App Check в режиме Enforce, debug-токены удалены.
- [ ] Аналитика собирает 5 событий, баннер согласия на cookies работает.
- [ ] Terms и Privacy опубликованы, ссылки из Sign up ведут на них.
- [ ] CI: preview channel на каждый PR, prod выкатывается по тегу.
- [ ] На браузере без WebGL2 показывается экран «Браузер не поддерживается».
