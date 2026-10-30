import { Suspense, lazy, useEffect } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./features/auth/AuthProvider";
import { PublicOnly, RequireAuth, RequireUnfinishedProfile } from "./features/auth/guards";
import { useAuthLanguage } from "./features/auth/useAuthLanguage";
import { ConsentBanner } from "./features/analytics/ConsentBanner";
import { PreviewBadge } from "./features/preview/PreviewBadge";
import LegalPage from "./features/legal/LegalPage";
import { SupportGate } from "./features/support/SupportGate";
import { useProfileSync } from "./features/profile/useProfileSync";
import { useDocumentLanguage } from "./i18n/useDocumentLanguage";
import { analytics } from "./lib/analytics";
import ForgotPassword from "./pages/ForgotPassword";
import Login from "./pages/Login";
import Profile from "./pages/Profile";
import Signup from "./pages/Signup";

// The Workspace (engine, shaders) is only loaded for people who are signed in.
const Workspace = lazy(() => import("./pages/Workspace"));

function Routing() {
  useAuthLanguage();
  useDocumentLanguage();
  useProfileSync();
  return (
    <Routes>
      <Route element={<PublicOnly />}>
        <Route path="/login" element={<Login />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
      </Route>
      <Route element={<PublicOnly allowUnfinished />}>
        <Route path="/signup" element={<Signup />} />
      </Route>
      <Route element={<RequireUnfinishedProfile />}>
        <Route path="/choose-username" element={<Signup />} />
      </Route>
      <Route element={<RequireAuth />}>
        <Route path="/" element={<SupportGate><Workspace /></SupportGate>} />
        <Route path="/profile" element={<Profile />} />
      </Route>
      <Route path="/terms" element={<LegalPage doc="terms" />} />
      <Route path="/privacy" element={<LegalPage doc="privacy" />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  useEffect(() => analytics.watch(), []);
  return (
    <BrowserRouter>
      <AuthProvider>
        <Suspense fallback={null}>
          <Routing />
          <ConsentBanner />
          <PreviewBadge />
        </Suspense>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
