import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useWorkspaceStore } from "../../store/workspaceStore";
import { useAuthUser } from "../session/useAuthUser";
import { ONBOARDING_STEPS } from "./onboardingSteps";
import { hasSeenOnboarding, markOnboardingSeen } from "./onboardingSeen";
import { placeCard } from "./placeCard";
import "./onboarding.css";

/** Phones get the card as a bottom sheet instead of pointing at a panel. */
const NARROW_PX = 700;
const TARGET_CLASS = "onboarding-target";

/**
 * First-run tour of the Workspace: pick a cartridge → dip → stencil → draw. Four short tips, skippable,
 * shown once per person on this device. It never blocks the Workspace: the person can keep working.
 */
export function OnboardingTips() {
  const { t } = useTranslation();
  const user = useAuthUser();
  const uid = user?.uid ?? null;
  const ready = useWorkspaceStore((s) => s.engineReady && !s.workLoading);
  const dialogOpen = useWorkspaceStore((s) => s.stencilDialog.open);
  const [done, setDone] = useState(false);
  const [index, setIndex] = useState(0);
  const [placement, setPlacement] = useState<{ left: number; top: number } | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);

  const active = uid !== null && ready && !done && !hasSeenOnboarding(uid);
  const visible = active && !dialogOpen;
  const step = ONBOARDING_STEPS[index]!;

  const finish = () => {
    if (uid) markOnboardingSeen(uid);
    setDone(true);
  };

  // Outline the thing the tip is about, and keep the card next to it while panels are moved or the window is resized.
  useLayoutEffect(() => {
    if (!visible) return;
    const place = () => {
      const target = document.querySelector<HTMLElement>(step.target);
      const card = cardRef.current;
      document.querySelectorAll(`.${TARGET_CLASS}`).forEach((el) => el !== target && el.classList.remove(TARGET_CLASS));
      target?.classList.add(TARGET_CLASS);
      if (!card) return;
      if (window.innerWidth < NARROW_PX) return setPlacement(null);
      const box = target?.getBoundingClientRect();
      const next = placeCard(
        box && box.width > 0 ? { left: box.left, top: box.top, right: box.right, bottom: box.bottom } : null,
        { width: card.offsetWidth, height: card.offsetHeight },
        { width: window.innerWidth, height: window.innerHeight },
      );
      setPlacement((old) => (old && old.left === next.left && old.top === next.top ? old : next));
    };
    place();
    const timer = window.setInterval(place, 400);
    window.addEventListener("resize", place);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("resize", place);
      document.querySelectorAll(`.${TARGET_CLASS}`).forEach((el) => el.classList.remove(TARGET_CLASS));
    };
  }, [visible, step.target, index]);

  // Each tip hands focus to NEXT, so Enter walks through the tour. A card that is still hidden (not placed yet) cannot take focus.
  const placed = placement !== null;
  useEffect(() => {
    if (visible) nextRef.current?.focus({ preventScroll: true });
  }, [visible, index, placed]);

  if (!visible) return null;
  const last = index === ONBOARDING_STEPS.length - 1;

  return (
    <div
      ref={cardRef}
      className="onboarding"
      role="dialog"
      aria-modal="false"
      aria-label={t("onboarding.label")}
      data-testid="onboarding"
      data-step={step.id}
      // Hidden until placed, so it never flashes in the wrong spot (on phones the CSS shows it as a bottom sheet).
      style={placement ? { left: placement.left, top: placement.top } : { left: 0, top: 0, visibility: "hidden" }}
      onKeyDown={(e) => {
        if (e.key === "Escape") finish();
      }}
    >
      <div className="onboarding__step">{t("onboarding.step", { n: index + 1, total: ONBOARDING_STEPS.length })}</div>
      <h2 className="onboarding__title">{t(`onboarding.${step.id}.title`)}</h2>
      <p className="onboarding__text">{t(`onboarding.${step.id}.text`)}</p>
      <div className="onboarding__actions">
        <button type="button" className="btn onboarding__skip" onClick={finish}>
          {t("onboarding.skip")}
        </button>
        {index > 0 && (
          <button type="button" className="btn btn--white" onClick={() => setIndex(index - 1)}>
            {t("onboarding.back")}
          </button>
        )}
        <button ref={nextRef} type="button" className="btn btn--lime btn--raised" onClick={() => (last ? finish() : setIndex(index + 1))}>
          {last ? t("onboarding.done") : t("onboarding.next")}
        </button>
      </div>
    </div>
  );
}
