import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "./authContext";

function Splash() {
  const { t } = useTranslation();
  return (
    <div className="auth-splash" role="status">
      {t("auth.splash")}
    </div>
  );
}

/** Routes that need a signed-in user with a finished profile (Workspace, Profile). */
export function RequireAuth() {
  const { status, profile } = useAuth();
  const location = useLocation();
  if (status === "loading") return <Splash />;
  if (status === "signedOut") return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  if (profile === "loading") return <Splash />;
  if (profile === "missing") return <Navigate to="/choose-username" replace />;
  return <Outlet />;
}

/**
 * Log in, sign up, forgot password: for people who are not signed in. Someone who is, goes to
 * the Workspace. `allowUnfinished` keeps a signed-in person without a profile on the page (the
 * sign-up screen after "username taken").
 */
export function PublicOnly({ allowUnfinished = false }: { allowUnfinished?: boolean }) {
  const { status, profile } = useAuth();
  const location = useLocation();
  if (status === "loading") return <Splash />;
  if (status === "signedOut") return <Outlet />;
  // The sign-up form creates the account and then the profile; it must stay mounted in between.
  if (allowUnfinished && profile !== "ready") return <Outlet />;
  if (profile === "loading") return <Splash />;
  if (profile === "ready") {
    const from = (location.state as { from?: string } | null)?.from;
    return <Navigate to={from ?? "/"} replace />;
  }
  return allowUnfinished ? <Outlet /> : <Navigate to="/choose-username" replace />;
}

/** The "choose a username" step: signed in, no profile yet. */
export function RequireUnfinishedProfile() {
  const { status, profile } = useAuth();
  if (status === "loading") return <Splash />;
  if (status === "signedOut") return <Navigate to="/login" replace />;
  if (profile === "loading") return <Splash />;
  if (profile === "ready") return <Navigate to="/" replace />;
  return <Outlet />;
}
