import { Button } from "@/components/ui/Button";
import { cx } from "@/components/ui/cx";
import { Icon } from "@/components/ui/Icons";
import {
  countStrip,
  SessionStrip,
  type StripMark,
} from "@/components/ui/SessionStrip";
import { slangAriaLabel, SlangMeter } from "@/components/ui/SlangMeter";
import type { SlangLevel } from "@/lib/types";
import { nQuestions, plural } from "./list-format";

// The phone parts of the exercise done screen (pick E4 B, `X-Done-B`): the result as an index card,
// the misses as slips, the web words as cards not yet on record. ExerciseDone keeps the data and
// the desktop layout.

/** The strip writes in after the heading has landed (as «Готово на сегодня»). */
const STRIP_AT_MS = 240;

/** The miss mark of a slip: the strip's miss cell (an --again outline with a bar inside: a shape, not only colour). */
const MISS: readonly StripMark[] = ["miss"];

const sectionHead = "m-0 text-[15px] leading-5 font-normal text-muted";

/**
 * «ИТОГ НАБОРА» over the red rule, the set's title, the session strip (one cell per answer in the
 * order given, attemptMarks) and «3 из 5 с первого раза»: 3 is the strip's ink cells, 5 the
 * questions. The strip writes in once; its name carries the exact counts.
 */
export function DoneResultCard({
  title,
  marks,
  total,
  note,
}: {
  title: string;
  marks: readonly StripMark[];
  total: number;
  note?: string | null;
}) {
  const c = countStrip(marks);
  const parts = [
    `${c.first} с первого раза`,
    c.miss > 0 && `${c.miss} ${plural(c.miss, ["ошибка", "ошибки", "ошибок"])}`,
    c.requeued > 0 &&
      `${c.requeued} ${plural(c.requeued, ["повтор", "повтора", "повторов"])}`,
  ].filter(Boolean);
  return (
    <article
      aria-label={`Итог набора «${title}»`}
      data-done-tally=""
      className="mt-4 shrink-0 overflow-hidden rounded-card border border-rule bg-surface"
    >
      <div className="flex h-10 items-center gap-1.5 border-b-2 border-red px-4 font-mono text-[11px] leading-4 tracking-[.06em] text-muted uppercase">
        <span>Итог набора</span>
        {note && <span className="truncate">· {note}</span>}
      </div>
      <div className="px-4 pt-3.5 pb-[18px]">
        <p className="m-0 font-serif text-[26px] leading-8 font-medium tracking-[-0.01em] [overflow-wrap:anywhere]">
          {title}
        </p>
        {marks.length > 0 && (
          <SessionStrip
            size="cells"
            marks={marks}
            label={`${nQuestions(total)}: ${parts.join(", ")}`}
            writeIn
            writeInDelay={STRIP_AT_MS}
            className="mt-[18px]"
          />
        )}
        <p
          aria-hidden={marks.length > 0 || undefined}
          className="m-0 mt-3 text-[15px] leading-5 text-muted tabular-nums"
        >
          <span className="font-medium text-ink">
            {c.first} из {total}
          </span>{" "}
          с первого раза
        </p>
      </div>
    </article>
  );
}

export interface DoneSlip {
  key: string;
  fr: string;
  ru: string;
  /** The meter, when the word's level is known (nothing for a neutral word). */
  meter?: { level: SlangLevel; verlan: boolean } | null;
  /** Opens the word's card; without it the slip is not a link (the word is not in the library). */
  onOpen?: () => void;
}

/** «Ошибки»: the missed words as slips two to a row, each with the miss mark; a tap opens the word card. */
export function DoneMissSlips({ slips }: { slips: readonly DoneSlip[] }) {
  return (
    <section aria-label="Ошибки" className="mt-7 shrink-0">
      <h2 className={sectionHead}>Ошибки</h2>
      <ul className="m-0 mt-2 grid list-none grid-cols-2 gap-2 p-0">
        {slips.map((s) => {
          const body = (
            <>
              <SessionStrip size="cells" marks={MISS} label={false} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span
                  lang="fr"
                  className="truncate font-serif text-[19px] leading-6 font-medium"
                >
                  {s.fr}
                </span>
                <span className="flex min-w-0 items-center gap-2 text-[13px] leading-[18px] text-muted">
                  <span className="min-w-0 truncate">{s.ru}</span>
                  {s.meter && (
                    <SlangMeter
                      row
                      level={s.meter.level}
                      verlan={s.meter.verlan}
                    />
                  )}
                </span>
              </span>
              {s.onOpen && (
                <Icon
                  name="chevron-right"
                  size={16}
                  className="-mr-0.5 shrink-0 text-muted"
                />
              )}
            </>
          );
          const slip =
            "flex h-16 w-full min-w-0 items-center gap-2.5 rounded-chip border border-rule bg-surface pr-2.5 pl-3 text-left text-ink";
          const meter =
            s.meter && (s.meter.level > 0 || s.meter.verlan)
              ? `, ${slangAriaLabel(s.meter.level, s.meter.verlan)}`
              : "";
          return (
            <li key={s.key} className="min-w-0">
              {s.onOpen ? (
                <button
                  type="button"
                  onClick={s.onOpen}
                  aria-label={`${s.fr} — ${s.ru}${meter}. Открыть карточку`}
                  className={cx(slip, "press active:bg-surface-2")}
                >
                  {body}
                </button>
              ) : (
                <div className={slip}>{body}</div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export interface DoneWebWord {
  ref: string;
  fr: string;
  ru: string;
  slang_level: SlangLevel;
  verlan: boolean;
  /** Already in the library: the frame is solid and the action gone. */
  inLibrary: boolean;
}

/**
 * «Новое слово из веба»: each web word as a card in a dashed frame (not yet on record) with the
 * 44px+ «Положить в библиотеку»; once it is in, the frame turns solid and the row reads «В
 * библиотеке» (the snackbar offers «Отменить»).
 */
export function DoneWebWords({
  words,
  ready,
  pending,
  onAdd,
}: {
  words: readonly DoneWebWord[];
  ready: boolean;
  pending: string | null;
  onAdd: (ref: string) => void;
}) {
  return (
    <section
      aria-label={
        words.length === 1 ? "Новое слово из веба" : "Новые слова из веба"
      }
      className="mt-7 shrink-0"
    >
      <h2 className={sectionHead}>
        {words.length === 1 ? "Новое слово" : "Новые слова"}{" "}
        <span className="font-serif italic">из веба</span>
      </h2>
      <div className="mt-2 flex flex-col gap-2">
        {words.map((w) => (
          <div
            key={w.ref}
            data-new-word={w.inLibrary ? "saved" : "web"}
            className={cx(
              "overflow-hidden rounded-card border bg-surface",
              w.inLibrary ? "border-rule" : "border-dashed border-boundary",
            )}
          >
            <div className="px-4 py-3">
              <span
                lang="fr"
                className="block truncate font-serif text-[22px] leading-7 font-medium"
              >
                {w.fr}
              </span>
              <span className="mt-0.5 flex min-w-0 items-center gap-2 text-[14px] leading-5 text-muted">
                <span className="min-w-0 truncate">{w.ru}</span>
                <SlangMeter row level={w.slang_level} verlan={w.verlan} />
              </span>
            </div>
            {w.inLibrary ? (
              <div className="flex h-12 items-center gap-2.5 border-t border-rule px-4 text-[15px] text-muted">
                <Icon name="check" strokeWidth={1.5} />В библиотеке
              </div>
            ) : (
              <button
                type="button"
                disabled={!ready}
                aria-busy={pending === w.ref || undefined}
                onClick={() => {
                  if (pending == null) onAdd(w.ref);
                }}
                className="press-tint flex h-12 w-full items-center gap-2.5 border-t border-dashed border-rule-dashed bg-transparent px-4 text-left text-[15px] font-medium text-ink disabled:cursor-default"
              >
                <Icon name="library" strokeWidth={1.5} />
                <span className="flex-1">Положить в библиотеку</span>
              </button>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

const TEXT_ACTION =
  "flex items-center bg-transparent px-4 text-[15px] leading-5 font-medium text-ink underline decoration-boundary decoration-1 underline-offset-4 active:text-muted";

/** At the bottom: the black «Повторить ошибки (N)» (only with misses) and the text action «К наборам». */
export function DonePhoneActions({
  repeat,
  pending,
  onRepeat,
  onLeave,
}: {
  repeat: number;
  pending: boolean;
  onRepeat: () => void;
  onLeave: () => void;
}) {
  return (
    <>
      <div aria-hidden="true" className="min-h-4 flex-1" />
      <div className="flex shrink-0 flex-col gap-1">
        {repeat > 0 && (
          <Button block pending={pending} onClick={onRepeat}>
            Повторить ошибки ({repeat})
          </Button>
        )}
        <div className="flex h-11 items-stretch justify-center">
          <button type="button" onClick={onLeave} className={TEXT_ACTION}>
            К наборам
          </button>
        </div>
      </div>
    </>
  );
}
