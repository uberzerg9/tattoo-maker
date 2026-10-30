import { useId, useState } from "react";
import type { InputHTMLAttributes, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { passwordStrength, strengthName } from "./passwordStrength";

interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "id"> {
  label: string;
  /** Message shown under the field; makes it invalid. */
  error?: string | null;
  hint?: string;
  trailing?: ReactNode;
  action?: ReactNode;
}

export function TextField({ label, error, hint, trailing, action, className, ...input }: TextFieldProps) {
  const id = useId();
  const messageId = `${id}-message`;
  const message = error ?? hint ?? null;
  return (
    <div className="field">
      <div className="field__head">
        <label htmlFor={id}>{label}</label>
        {action}
      </div>
      <div className="field__row">
        <input
          id={id}
          className={error ? `input ${className ?? ""} is-invalid` : `input ${className ?? ""}`}
          aria-invalid={error ? true : undefined}
          aria-describedby={message ? messageId : undefined}
          {...input}
        />
        {trailing}
      </div>
      {message && (
        <p id={messageId} className={error ? "field__message field__message--error" : "field__message"} role={error ? "alert" : undefined}>
          {message}
        </p>
      )}
    </div>
  );
}

/** A password field with a SHOW / HIDE button. */
export function PasswordField({ label, error, action, ...input }: Omit<TextFieldProps, "type" | "trailing">) {
  const { t } = useTranslation();
  const [shown, setShown] = useState(false);
  return (
    <TextField
      {...input}
      label={label}
      error={error}
      action={action}
      type={shown ? "text" : "password"}
      trailing={
        <button type="button" className="field__toggle" aria-pressed={shown} onClick={() => setShown((s) => !s)}>
          {shown ? t("auth.common.hide") : t("auth.common.show")}
        </button>
      }
    />
  );
}

const BAR_COLORS = ["var(--color-pink)", "var(--color-yellow)", "var(--color-blue)", "var(--color-lime)"];

/** Four bars that fill with the password's strength, and its name. */
export function StrengthMeter({ password }: { password: string }) {
  const { t } = useTranslation();
  const step = passwordStrength(password);
  const name = strengthName(step, password);
  return (
    <div className="strength" aria-label={t("auth.signup.strengthLabel")}>
      <div className="strength__bars" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className="strength__bar" style={{ background: i < step ? BAR_COLORS[step - 1] : undefined }} />
        ))}
      </div>
      <span className="strength__name" role="status">
        {name ? t(`auth.signup.strength.${name}`) : ""}
      </span>
    </div>
  );
}

interface ChipGroupProps<T extends string> {
  label: string;
  value: T;
  options: { id: T; label: string }[];
  onChange: (id: T) => void;
  variant: "pill" | "square";
}

export function ChipGroup<T extends string>({ label, value, options, onChange, variant }: ChipGroupProps<T>) {
  const id = useId();
  return (
    <div className="field">
      <span id={id} className="field__label">
        {label}
      </span>
      <div role="group" aria-labelledby={id} className={`chips chips--${variant}`}>
        {options.map((o) => (
          <button key={o.id} type="button" className="chip" aria-pressed={o.id === value} onClick={() => onChange(o.id)}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
