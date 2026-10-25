"use client";

// «План повторения» (SPEC «План дня и уровень языка», pick R22 D1 C; boards Review-Settings-C,
// desktop D-Review-Settings): how many new words a day, the review cap, the order of new words,
// where new cards go and when the reverse side starts. The phone Settings index (pick S1 B) and the
// desktop «Повторение» show one row «План повторения ›» with the summary; it opens its own screen
// (/settings/plan). The plan is the
// synced `user_prefs` row `study_plan` (lib/user-prefs.ts), so every device and the Claude connector
// plan the same day. Saving is immediate, like the other settings.
import Link from "next/link";
import { useId, type ReactNode } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { PLAN_SETTINGS_HREF, countsCards, planSummary } from "@/components/review/plan-format";
import { Collapse } from "@/components/ui/Collapse";
import { Header } from "@/components/ui/Header";
import { Icon } from "@/components/ui/Icons";
import { Segmented } from "@/components/ui/Segmented";
import { useSnackbar } from "@/components/ui/Snackbar";
import { cx } from "@/components/ui/cx";
import { listFolders } from "@/lib/folders";
import { usePlanFit } from "@/lib/plan-fit";
import {
  clampNewWords,
  NEW_ORDERS,
  NEW_WORDS_MAX,
  NEW_WORDS_MIN,
  PLAN_MIXES,
  PLAN_RU_FR,
  REVIEW_CAP_MIN,
  type NewOrder,
  type PlanRuFr,
  type StudyPlan,
} from "@/lib/core/study-plan";
import { setStudyPlan, useStudyPlan } from "@/lib/user-prefs";
import { DeskStepper, RadioRow, TextOptions } from "./DesktopControls";
import { fitLine, visibleSuggestion } from "./plan-fit-format";
import { DeskFitCaption, DeskSuggestion, PhoneFitLine, PhoneSuggestion } from "./PlanFitRows";
import { deskCaption, MIX_LABELS, NEW_ORDER_COPY, RU_FR_COPY, stepReviewCap, themesCaption } from "./plan-settings";
import { Stepper } from "./Stepper";
import { Valued } from "./Valued";

export { PLAN_SETTINGS_HREF };

const FOOTNOTE = "Настройка общая для всех устройств — Claude тоже её видит.";
const NEW_CAPTION = "Меньше, если много повторений или точность падает";

/** The stored plan (undefined while it loads) and a saver that reports a failed write. */
function usePlanSetting() {
  const plan = useStudyPlan();
  const toast = useSnackbar();
  const save = (patch: Partial<StudyPlan>) => {
    if (!plan) return;
    setStudyPlan({ ...plan, ...patch }).catch(() => toast.show({ message: "Не получилось сохранить настройку" }));
  };
  return { plan, save };
}

/** Theme names in their order, for «По темам · 01 → 35». */
function useThemesCaption(): string {
  const names = useLiveQuery(async () => (await listFolders()).map((f) => f.name), []);
  return themesCaption(names ?? []);
}

/** «Новых слов в день» («Новых карточек в день» with «Назавтра», where the limit counts cards). */
const newLabel = (plan: StudyPlan | undefined) => (plan && countsCards(plan) ? "Новых карточек в день" : "Новых слов в день");

/** «∞» on the cap stepper for «без лимита» (spoken as such). */
const NO_CAP = (
  <>
    <span aria-hidden="true">∞</span>
    <span className="sr-only">без лимита</span>
  </>
);

// --- The desktop row in Settings → «Повторение» (phones: the index row, SettingsScreen) ---------------------------------------------------------

/** Desktop: «План повторения» with the summary (13 muted) and a chevron, the whole row a link. */
export function DeskPlanRow() {
  const plan = useStudyPlan();
  return (
    <div className="flex h-11 items-center border-b border-rule">
      <Link
        href={PLAN_SETTINGS_HREF}
        data-plan-row=""
        className="-mx-2 flex h-[43px] min-w-0 flex-1 items-center gap-4 rounded-[4px] px-2 text-[15px] leading-5 text-ink no-underline hoverable:bg-hover focus-visible:outline-offset-[-2px]"
      >
        <span className="min-w-0 flex-1 truncate">План повторения</span>
        <span className="truncate text-[13px] text-muted">{plan ? planSummary(plan) : ""}</span>
        <Icon name="chevron-right" size={16} strokeWidth={1.75} className="shrink-0 text-muted" />
      </Link>
    </div>
  );
}

// --- Phones ------------------------------------------------------------------------------------------

/** Mono 11 group label over a hairline («Порядок новых», «Обратная сторона · RU → FR»). */
function PhoneHeading({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h2
      id={id}
      className="m-0 mt-6 shrink-0 border-b border-rule pb-2 font-mono text-[11px] leading-4 font-medium tracking-[.06em] text-muted uppercase"
    >
      {children}
    </h2>
  );
}

/**
 * A radio list of 44px rows: label 15 (500 when picked), 18px check. Only the picked option shows its
 * 12 muted caption (it opens in place, Collapse); every caption stays the option's description.
 */
function PhoneRadioList<T extends string>({
  name,
  labelledBy,
  label,
  options,
  value,
  onChange,
}: {
  name: string;
  labelledBy?: string;
  label?: string;
  options: readonly { value: T; label: string; caption: string }[];
  value: T | undefined;
  onChange: (value: T) => void;
}) {
  return (
    <div role="radiogroup" aria-labelledby={labelledBy} aria-label={label} className="flex shrink-0 flex-col">
      {options.map((option) => {
        const checked = value === option.value;
        return (
          <label
            key={option.value}
            className="press-tint relative flex min-h-11 cursor-pointer items-center gap-2 border-b border-rule has-[:focus-visible]:outline-2 has-[:focus-visible]:-outline-offset-2 has-[:focus-visible]:outline-ink"
          >
            <input
              type="radio"
              name={name}
              checked={checked}
              onChange={() => onChange(option.value)}
              aria-labelledby={`${name}-${option.value}-l`}
              aria-describedby={`${name}-${option.value}-d`}
              className="absolute top-0 left-0 m-0 size-px opacity-0"
            />
            <span className="flex min-w-0 flex-1 flex-col py-3">
              <span id={`${name}-${option.value}-l`} className={cx("truncate text-[15px] leading-5 text-ink", checked && "font-medium")}>
                {option.label}
              </span>
              <Collapse open={checked}>
                <span id={`${name}-${option.value}-d`} className="block truncate text-[12px] leading-4 text-muted">
                  {option.caption}
                </span>
              </Collapse>
            </span>
            <span aria-hidden="true" className="flex w-5 shrink-0 justify-end">
              {checked && <Icon name="check" size={18} />}
            </span>
          </label>
        );
      })}
    </div>
  );
}

/**
 * The phone screen «План повторения» (Review-Settings-C, trimmed): a large title, the two steppers
 * with nothing above them, «Порядок новых» and «Обратная сторона» with only the picked option
 * captioned. The summary line, the stepper captions and the shared-settings footnote are gone (the
 * Settings row carries the summary, «Данные» the footnote). «План и прогресс» (D2 A): at most one
 * italic fit line under «Новых слов в день», and the quiet suggestion row under it (PlanFitRows).
 */
export function PhoneStudyPlan() {
  const { plan, save } = usePlanSetting();
  const fit = usePlanFit();
  const line = fitLine(fit);
  const suggestion = visibleSuggestion(fit);
  const ids = useId();
  const themes = useThemesCaption();
  const known = plan !== undefined;
  const cap = plan?.review_cap ?? null;
  const orders = NEW_ORDERS.map((value) => ({ value, ...NEW_ORDER_COPY[value], ...(value === "themes" ? { caption: themes } : {}) }));
  const sides = PLAN_RU_FR.map((value) => ({ value, ...RU_FR_COPY[value] }));
  const mixes = PLAN_MIXES.map((value) => ({ value, label: MIX_LABELS[value].phone }));

  return (
    <div className="contents md:hidden">
      <Header large title="План повторения" fallbackHref="/settings" backLabel="Назад к настройкам" />
      <main className="flex flex-1 flex-col px-4 pb-6">
        <Valued known={known}>
          <section aria-label="Темп" className="mt-2 flex shrink-0 flex-col border-t border-rule">
            <div className="flex shrink-0 flex-col border-b border-rule">
              <div className="flex h-14 shrink-0 items-center gap-2">
                <span className="min-w-0 flex-1 text-[15px] leading-5">{newLabel(plan)}</span>
                <Stepper
                  label={newLabel(plan)}
                  value={plan?.new_words ?? 0}
                  min={NEW_WORDS_MIN}
                  max={NEW_WORDS_MAX}
                  describedBy={line ? `${ids}-fit` : undefined}
                  onStep={(delta) => plan && save({ new_words: clampNewWords(plan.new_words + delta) })}
                />
              </div>
              {line && <PhoneFitLine id={`${ids}-fit`} line={line} />}
            </div>
            {fit && suggestion && <PhoneSuggestion fit={fit} suggestion={suggestion} />}
            <div className="flex h-14 shrink-0 items-center gap-2 border-b border-rule">
              <span className="min-w-0 flex-1 text-[15px] leading-5">Повторений в день</span>
              {cap !== null && (
                <span aria-hidden="true" className="text-[13px] leading-4 whitespace-nowrap text-muted">
                  до
                </span>
              )}
              <Stepper
                label="Повторений в день"
                value={cap ?? Infinity}
                min={REVIEW_CAP_MIN}
                display={known && cap === null ? NO_CAP : undefined}
                onStep={(delta) => plan && save({ review_cap: stepReviewCap(plan.review_cap, delta) })}
              />
            </div>
          </section>

          <section aria-labelledby={`${ids}-order`} className="flex shrink-0 flex-col">
            <PhoneHeading id={`${ids}-order`}>Порядок новых</PhoneHeading>
            <PhoneRadioList<NewOrder>
              name={`${ids}-order-r`}
              labelledBy={`${ids}-order`}
              options={orders}
              value={plan?.new_order}
              onChange={(new_order) => save({ new_order })}
            />
            <div className="flex shrink-0 flex-col items-start pt-3 pb-1">
              <span id={`${ids}-mix`} className="text-[15px] leading-5">
                Новые в сессии
              </span>
              <Segmented
                ariaLabelledby={`${ids}-mix`}
                options={mixes}
                value={plan?.mix ?? null}
                onChange={(mix) => save({ mix })}
              />
            </div>
          </section>

          <section aria-labelledby={`${ids}-ru`} className="flex shrink-0 flex-col">
            <PhoneHeading id={`${ids}-ru`}>Обратная сторона · RU → FR</PhoneHeading>
            <PhoneRadioList<PlanRuFr>
              name={`${ids}-ru-r`}
              label="Обратная сторона"
              options={sides}
              value={plan?.ru_fr}
              onChange={(ru_fr) => save({ ru_fr })}
            />
          </section>
        </Valued>
      </main>
    </div>
  );
}

// --- Desktop -----------------------------------------------------------------------------------------

/** «Темп», «Новые слова»…: Plex 500 13 + 1px ink rule (h3 under the page's h2). */
function DeskSubSection({ id, title, first, children }: { id: string; title: string; first?: boolean; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className={cx("flex flex-col", first ? "mt-4" : "mt-5")}>
      <div className="mb-1 flex h-7 items-center border-b border-ink">
        <h3 id={id} className="m-0 text-[13px] leading-5 font-medium text-ink">
          {title}
        </h3>
      </div>
      {children}
    </section>
  );
}

/** A label (15, 240px column) with option rows at its right. */
function DeskOptionsRow({ labelId, label, children }: { labelId: string; label: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-4 border-b border-rule">
      <span id={labelId} className="w-[224px] shrink-0 truncate pt-2.5 text-[15px] leading-5 text-ink">
        {label}
      </span>
      <div role="radiogroup" aria-labelledby={labelId} className="flex min-w-0 flex-1 flex-col [&>label:last-child>span:last-child]:hidden">
        {children}
      </div>
    </div>
  );
}

/**
 * The desktop page «План повторения» in the settings form column (D-Review-Settings). «План и
 * прогресс» (D-Plan-Fit-A): the stepper's caption gains a sparkline and the fit line, and the
 * suggestion row follows it.
 */
export function DeskStudyPlan() {
  const { plan, save } = usePlanSetting();
  const fit = usePlanFit();
  const line = fitLine(fit);
  const suggestion = visibleSuggestion(fit);
  const ids = useId();
  const themes = useThemesCaption();
  const known = plan !== undefined;
  const cap = plan?.review_cap ?? null;

  return (
    <Valued known={known}>
      <Link
        href="/settings#set-review"
        className="-ml-1 inline-flex h-6 items-center gap-0.5 self-start rounded-[4px] pr-1 text-[13px] leading-5 font-medium text-muted no-underline hoverable:text-ink"
      >
        <Icon name="chevron-left" size={14} strokeWidth={1.75} />
        Повторение
      </Link>
      <div className="mt-1 flex h-8 items-baseline justify-between gap-4">
        <h2 className="m-0 font-serif text-[24px] leading-8 font-medium tracking-[-0.01em] text-ink">План повторения</h2>
        <span data-value="" className="truncate font-mono text-[11px] leading-4 tracking-[.06em] text-muted uppercase">
          {plan ? planSummary(plan) : ""}
        </span>
      </div>

      <DeskSubSection id={`${ids}-tempo`} title="Темп" first>
        <div className="flex min-h-[60px] flex-col justify-center border-b border-rule py-2.5">
          <div className="flex items-center gap-4">
            <span className="flex min-w-0 flex-1 flex-col">
              <span id={`${ids}-new-l`} className="text-[15px] leading-5 text-ink">
                {newLabel(plan)}
              </span>
              <span className="text-[12px] leading-4 text-muted">{NEW_CAPTION}</span>
            </span>
            <DeskStepper
              describedBy={line ? `${ids}-fit` : undefined}
              labelledBy={`${ids}-new-l`}
              value={plan?.new_words ?? 0}
              min={NEW_WORDS_MIN}
              max={NEW_WORDS_MAX}
              onStep={(delta) => plan && save({ new_words: clampNewWords(plan.new_words + delta) })}
            />
          </div>
          {/* The sparkline and the fit line span the row, under the caption and the stepper (D-Plan-Fit-A). */}
          {fit && line && <DeskFitCaption id={`${ids}-fit`} fit={fit} line={line} />}
        </div>
        {fit && suggestion && <DeskSuggestion fit={fit} suggestion={suggestion} />}
        <div className="flex min-h-[60px] items-center gap-4 border-b border-rule py-2.5">
          <span className="flex min-w-0 flex-1 flex-col">
            <span id={`${ids}-cap-l`} className="text-[15px] leading-5 text-ink">
              Повторений в день
            </span>
            <span className="text-[12px] leading-4 text-muted">Остальные — на следующий день, расписание не меняется</span>
          </span>
          <span aria-hidden="true" className={cx("text-[13px] text-muted", cap === null && "invisible")}>
            до
          </span>
          <DeskStepper
            labelledBy={`${ids}-cap-l`}
            value={cap ?? Infinity}
            min={REVIEW_CAP_MIN}
            display={known && cap === null ? "∞" : undefined}
            valueText={known && cap === null ? "без лимита" : undefined}
            onStep={(delta) => plan && save({ review_cap: stepReviewCap(plan.review_cap, delta) })}
          />
        </div>
      </DeskSubSection>

      <DeskSubSection id={`${ids}-new`} title="Новые слова">
        <DeskOptionsRow labelId={`${ids}-order`} label="Порядок новых">
          {NEW_ORDERS.map((value) => (
            <RadioRow
              dense
              key={value}
              name={`${ids}-order-r`}
              label={NEW_ORDER_COPY[value].label}
              caption={deskCaption(value === "themes" ? themes : NEW_ORDER_COPY[value].caption)}
              checked={plan?.new_order === value}
              onSelect={() => save({ new_order: value })}
            />
          ))}
        </DeskOptionsRow>
        <div className="flex h-11 items-center gap-4 border-b border-rule">
          <span id={`${ids}-mix`} className="min-w-0 flex-1 truncate text-[15px] leading-5 text-ink">
            Новые в сессии
          </span>
          {/* Without a stored plan the options show no choice (Valued draws them valueless). */}
          <TextOptions
            ariaLabelledby={`${ids}-mix`}
            options={PLAN_MIXES.map((value) => ({ value, label: MIX_LABELS[value].desk }))}
            value={plan?.mix ?? "mixed"}
            onChange={(mix) => save({ mix })}
          />
        </div>
      </DeskSubSection>

      <DeskSubSection id={`${ids}-ru`} title="Обратная сторона · RU → FR">
        <DeskOptionsRow labelId={`${ids}-when`} label="Когда показывать">
          {PLAN_RU_FR.map((value) => (
            <RadioRow
              dense
              key={value}
              name={`${ids}-ru-r`}
              label={RU_FR_COPY[value].label}
              caption={deskCaption(RU_FR_COPY[value].caption)}
              checked={plan?.ru_fr === value}
              onSelect={() => save({ ru_fr: value })}
            />
          ))}
        </DeskOptionsRow>
      </DeskSubSection>

      <p className="mt-3.5 mb-0 flex items-center gap-2 text-[13px] leading-5 text-muted">
        <Icon name="refresh" size={14} className="shrink-0" />
        {FOOTNOTE}
      </p>
    </Valued>
  );
}
