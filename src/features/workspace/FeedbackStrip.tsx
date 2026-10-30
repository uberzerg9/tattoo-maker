import { useTranslation } from "react-i18next";
import { useFormat } from "../../i18n/useFormat";
import type { TraumaLevel } from "./config";

interface FeedbackStripProps {
  passes: number;
  /** Null until a liner has hit near a stencil line. */
  deviationMm: number | null;
  traumaLevel: TraumaLevel;
}

export function FeedbackStrip({
  passes,
  deviationMm,
  traumaLevel,
}: FeedbackStripProps) {
  const { t } = useTranslation();
  const format = useFormat();

  return (
    <div className="feedback">
      <span>
        {t("workspace.feedback.passes")}{" "}
        <b className="feedback__num">{format.integer(passes)}</b>
      </span>
      <span>
        {t("workspace.feedback.deviation")}{" "}
        <b className="feedback__num">{deviationMm === null ? "–" : format.millimetres(deviationMm)}</b>
      </span>
      <span className="feedback__trauma">
        {t("workspace.feedback.trauma")}{" "}
        <b>{t(`workspace.feedback.traumaLevel.${traumaLevel}`)}</b>
      </span>
    </div>
  );
}
