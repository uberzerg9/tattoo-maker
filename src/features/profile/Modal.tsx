import { useEffect, useId } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import "./profile.css";

interface ModalProps {
  title: string;
  /** Escape and the close button call this; ignore it while something is being sent. */
  onClose: () => void;
  children: ReactNode;
  tone?: "lime" | "yellow" | "pink";
  busy?: boolean;
}

/** A sticker-style dialog for the profile's confirmations and forms. */
export function Modal({ title, onClose, children, tone = "lime", busy = false }: ModalProps) {
  const { t } = useTranslation();
  const titleId = useId();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, busy]);

  return (
    <div className="modal-backdrop">
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header className={`modal__head modal__head--${tone}`}>
          <h2 id={titleId} className="modal__title">
            {title}
          </h2>
          <button type="button" className="panel__toggle" aria-label={t("profilePage.close")} disabled={busy} onClick={onClose}>
            ×
          </button>
        </header>
        <div className="modal__body">{children}</div>
      </div>
    </div>
  );
}
