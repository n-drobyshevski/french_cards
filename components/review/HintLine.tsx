import { Fragment, type ReactNode } from "react";
import { FlatKey } from "@/components/ui/Kbd";

/** Shown only from 768 wide and 760 tall (DESKTOP-SPEC §2 height tiers); see REVIEW_DESK_CSS. */
export const HINT_LINE_CSS = `
[data-review-hints] { display: none; }
@media (min-width: 768px) and (min-height: 760px) {
  [data-review-hints] { display: flex; }
}
`;

export interface HintLineProps {
  revealed: boolean;
  practice: boolean;
  /** Single-letter keys are on (Z is listed). */
  letters: boolean;
  gradeButtons: 2 | 3;
}

type Hint = { keys: string[]; label: string; before?: string };

/**
 * Desktop hint line under the card (DESKTOP-SPEC §4 «Where keys are shown» 2): flat key names, no
 * boxes, left-aligned with the card, 24px from the bottom. Off with Settings › «Подсказки клавиш при
 * повторении» (settings.key_hints) and below 760px tall.
 */
export function HintLine({ revealed, practice, letters, gradeButtons }: HintLineProps) {
  const hints: Hint[] = revealed
    ? [
        { keys: ["←", "→"], label: "не знаю / знаю" },
        { keys: ["Пробел"], label: "вопрос" },
      ]
    : [{ before: "после переворота:", keys: gradeButtons === 2 ? ["1", "2"] : ["1", "2", "3"], label: "оценить" }];
  if (practice) hints.push({ keys: ["Esc"], label: "закончить практику" });
  else if (letters) hints.push({ keys: ["Z"], label: "отменить" });

  const parts: ReactNode[] = [];
  hints.forEach((hint, i) => {
    if (i > 0) {
      parts.push(
        <span key={`sep${i}`} aria-hidden="true" className="mx-1">
          ·
        </span>,
      );
    }
    parts.push(
      <Fragment key={i}>
        {hint.before && <span>{hint.before}</span>}
        {hint.keys.map((k) => (
          <FlatKey key={k}>{k}</FlatKey>
        ))}
        <span>{hint.label}</span>
      </Fragment>,
    );
  });

  return (
    <p
      data-review-hints=""
      className="pointer-events-none absolute bottom-6 left-1/2 m-0 h-4 w-(--card-w) max-w-[calc(100%-48px)] -translate-x-1/2 items-center gap-1.5 text-[12px] leading-4 whitespace-nowrap text-muted"
    >
      {parts}
    </p>
  );
}
