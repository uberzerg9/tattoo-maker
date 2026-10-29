import { useTranslation } from "react-i18next";

/** Decorative stickers pinned to the centre of the stage. */
export function Stickers() {
  const { t } = useTranslation();

  return (
    <div className="stickers" aria-hidden="true">
      <div className="sticker-pill">{t("workspace.decor.sticker")}</div>
      <svg
        className="sticker sticker--star"
        width="92"
        height="92"
        viewBox="0 0 100 100"
      >
        <path
          className="sticker__pink"
          d="M50 4 L61 36 L95 36 L68 56 L78 90 L50 70 L22 90 L32 56 L5 36 L39 36 Z"
          strokeWidth="4"
          strokeLinejoin="round"
        />
        <text
          className="sticker__text"
          x="50"
          y="58"
          textAnchor="middle"
          fontSize="15"
        >
          {t("workspace.decor.ink")}
        </text>
      </svg>
      <svg
        className="sticker sticker--smile"
        width="84"
        height="84"
        viewBox="0 0 100 100"
      >
        <circle
          className="sticker__yellow"
          cx="50"
          cy="50"
          r="44"
          strokeWidth="5"
        />
        <path
          className="sticker__line"
          d="M30 34 l12 12 M42 34 l-12 12 M58 34 l12 12 M70 34 l-12 12"
          strokeWidth="5"
          strokeLinecap="round"
        />
        <path
          className="sticker__line"
          d="M30 64 Q50 80 70 64"
          fill="none"
          strokeWidth="5"
          strokeLinecap="round"
        />
      </svg>
      <svg
        className="sticker sticker--board"
        width="140"
        height="56"
        viewBox="0 0 140 56"
      >
        <rect
          className="sticker__blue"
          x="4"
          y="10"
          width="132"
          height="30"
          rx="15"
          strokeWidth="4"
        />
        <circle
          className="sticker__wheel"
          cx="32"
          cy="46"
          r="7"
          strokeWidth="3"
        />
        <circle
          className="sticker__wheel"
          cx="108"
          cy="46"
          r="7"
          strokeWidth="3"
        />
        <path
          className="sticker__line"
          d="M40 25 h60"
          strokeWidth="3"
          strokeDasharray="4 5"
        />
      </svg>
      <svg
        className="sticker sticker--bolt"
        width="48"
        height="70"
        viewBox="0 0 48 70"
      >
        <path
          className="sticker__lime"
          d="M28 2 L4 40 H22 L16 68 L44 26 H26 Z"
          strokeWidth="4"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
