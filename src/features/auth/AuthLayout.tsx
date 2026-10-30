import type { ReactNode } from "react";
import { LegalFooter } from "../legal/LegalFooter";
import "./auth.css";

/** The two-column auth screen from the mockups: a sticker-covered hero on the left, a card on the right. */
export function AuthLayout({ hero, children }: { hero: ReactNode; children: ReactNode }) {
  return (
    <div className="auth">
      <div className="auth__hero">{hero}</div>
      <div className="auth__side">
        {children}
        <LegalFooter onDark />
      </div>
    </div>
  );
}

const STAR = "M50 4 L61 36 L95 36 L68 56 L78 90 L50 70 L22 90 L32 56 L5 36 L39 36 Z";
const BOLT = "M28 2 L4 40 H22 L16 68 L44 26 H26 Z";

export function StarSticker({ fill, label, className }: { fill: string; label: string; className: string }) {
  return (
    <svg className={`sticker-svg ${className}`} viewBox="0 0 100 100" aria-hidden="true">
      <path d={STAR} fill={fill} stroke="#0E0E0E" strokeWidth="4" strokeLinejoin="round" />
      <text x="50" y="58" textAnchor="middle" fontFamily="Unbounded, sans-serif" fontWeight="900" fontSize="15" fill="#0E0E0E">
        {label}
      </text>
    </svg>
  );
}

export function BoltSticker({ fill, className }: { fill: string; className: string }) {
  return (
    <svg className={`sticker-svg ${className}`} viewBox="0 0 48 70" aria-hidden="true">
      <path d={BOLT} fill={fill} stroke="#0E0E0E" strokeWidth="4" strokeLinejoin="round" />
    </svg>
  );
}

export function MachineSticker({ fill, className }: { fill: string; className: string }) {
  return (
    <svg className={`sticker-svg ${className}`} viewBox="0 0 140 56" aria-hidden="true">
      <rect x="4" y="10" width="132" height="30" rx="15" fill={fill} stroke="#0E0E0E" strokeWidth="4" />
      <circle cx="32" cy="46" r="7" fill="#F4F4F0" stroke="#0E0E0E" strokeWidth="3" />
      <circle cx="108" cy="46" r="7" fill="#F4F4F0" stroke="#0E0E0E" strokeWidth="3" />
      <path d="M40 25 h60" stroke="#0E0E0E" strokeWidth="3" strokeDasharray="4 5" />
    </svg>
  );
}

export function SmileySticker({ className }: { className: string }) {
  return (
    <svg className={`sticker-svg ${className}`} viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="50" cy="50" r="44" fill="#FFE14D" stroke="#0E0E0E" strokeWidth="5" />
      <path d="M30 34 l12 12 M42 34 l-12 12 M58 34 l12 12 M70 34 l-12 12" stroke="#0E0E0E" strokeWidth="5" strokeLinecap="round" />
      <path d="M30 64 Q50 80 70 64" fill="none" stroke="#0E0E0E" strokeWidth="5" strokeLinecap="round" />
    </svg>
  );
}
