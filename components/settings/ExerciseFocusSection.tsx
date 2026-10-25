"use client";

// Settings «Упражнения» → «Чаще в упражнениях» (SPEC «Упражнения», board Exercise-S-Settings-Focus;
// DESKTOP-SPEC §8): which of the user's words Claude favours in exercise sets, and how much of a set.
// Synced (`user_prefs` row `exercise_focus`): the connector applies it to sets asked for in the chat
// too. Saved at once, like the other settings.
import { useId } from "react";
import { Icon } from "@/components/ui/Icons";
import { Segmented } from "@/components/ui/Segmented";
import { useSnackbar } from "@/components/ui/Snackbar";
import { cx } from "@/components/ui/cx";
import { FOCUS_SHARE_LABELS, FOCUS_SHARES, FOCUS_TARGET_LABELS, FOCUS_TARGETS } from "@/lib/core/exercise-focus";
import type { ExerciseFocus } from "@/lib/types";
import { setExerciseFocus, useExerciseFocus } from "@/lib/user-prefs";
import { DeskSection, RadioRow } from "./DesktopControls";
import { ShareStops } from "./ShareStops";

/** The section's link target (`/settings#set-exercises`, from the request builder). */
export const EXERCISES_ANCHOR = "set-exercises";

const FOCUS_CAPTION = "Claude будет брать такие слова в упражнения — и когда просите в чате. Настройка общая для всех устройств.";

const SHARE_OPTIONS = FOCUS_SHARES.map((value) => ({ value, label: FOCUS_SHARE_LABELS[value] }));

/** The stored focus (undefined while it loads) and a saver that reports a failed write. */
function useFocusSetting() {
  const focus = useExerciseFocus();
  const toast = useSnackbar();
  const save = (patch: Partial<ExerciseFocus>) => {
    if (!focus) return;
    setExerciseFocus({ ...focus, ...patch }).catch(() => toast.show({ message: "Не получилось сохранить настройку" }));
  };
  return { focus, save };
}

/**
 * Phones: the body of the sub-screen /settings/exercises (board L-Settings-B-Exercises). The mono
 * label «Чаще в упражнениях» names the radio list (48px rows, check at the right); «Сколько в
 * наборе» is a 3-way segmented control, disabled while «Обычно» with one caption saying why. No
 * footer: that it is shared is said once, in «Данные».
 */
export function PhoneExerciseSection() {
  const { focus, save } = useFocusSetting();
  const ids = useId();
  const known = focus !== undefined;
  const off = !focus || focus.target === "normal";
  const heading = "m-0 shrink-0 pb-2 font-mono text-[11px] leading-4 font-medium tracking-[.06em] text-muted uppercase";
  return (
    <div inert={!known} aria-busy={!known || undefined} className="contents">
      <h2 id={`${ids}-target-l`} className={cx(heading, "mt-5 border-b border-rule")}>
        Чаще в упражнениях
      </h2>
      <div role="radiogroup" aria-labelledby={`${ids}-target-l`} className="flex shrink-0 flex-col">
        {FOCUS_TARGETS.map((target) => {
          const checked = focus?.target === target;
          return (
            <label
              key={target}
              className="press-tint relative flex h-12 cursor-pointer items-center gap-2 border-b border-rule has-[:focus-visible]:outline-2 has-[:focus-visible]:-outline-offset-2 has-[:focus-visible]:outline-ink"
            >
              <input
                type="radio"
                name={`${ids}-target`}
                checked={checked}
                onChange={() => save({ target })}
                className="absolute top-0 left-0 m-0 size-px opacity-0"
              />
              <span className={cx("min-w-0 flex-1 truncate text-[15px] leading-5 text-ink", checked && "font-medium")}>
                {FOCUS_TARGET_LABELS[target]}
              </span>
              <span aria-hidden="true" className="flex w-5 shrink-0 justify-end">
                {checked && <Icon name="check" size={18} />}
              </span>
            </label>
          );
        })}
      </div>
      <h2 id={`${ids}-share`} className={cx(heading, "mt-7")}>
        Сколько в наборе
      </h2>
      {/* Disabled («Обычно»): no ink — the kept choice is a grey cell, the labels muted, no taps. */}
      <Segmented
        variant="block"
        ariaLabelledby={`${ids}-share`}
        options={SHARE_OPTIONS.map((o) => ({ ...o, disabled: off }))}
        value={focus?.share ?? null}
        onChange={(share) => save({ share })}
        className={cx(
          "shrink-0",
          off && "bg-transparent! [&_[data-seg-slab]]:bg-surface-2! [&>button:disabled]:opacity-100 [&>button>span]:text-muted!",
        )}
      />
      {known && off && (
        <p className="m-0 mt-1.5 shrink-0 text-[12px] leading-4 text-muted">
          При «Обычно» не используется
        </p>
      )}
    </div>
  );
}

/** Desktop (≥ 768): option rows with a round mark, and the slider at the right of its row. */
export function DeskExerciseSection() {
  const { focus, save } = useFocusSetting();
  const ids = useId();
  const known = focus !== undefined;
  return (
    <DeskSection id={EXERCISES_ANCHOR} title="Упражнения">
      <div inert={!known} aria-busy={!known || undefined} className="contents">
        <div className="flex h-11 items-center border-b border-rule">
          <span id={`${ids}-target`} className="min-w-0 flex-1 truncate text-[15px] leading-5 text-ink">
            Чаще в упражнениях
          </span>
        </div>
        <div role="radiogroup" aria-labelledby={`${ids}-target`} className="flex flex-col pl-3">
          {FOCUS_TARGETS.map((target) => (
            <RadioRow
              key={target}
              name={`${ids}-target`}
              label={FOCUS_TARGET_LABELS[target]}
              checked={focus?.target === target}
              onSelect={() => save({ target })}
            />
          ))}
        </div>
        <div className="flex items-start gap-4 border-b border-rule">
          <span id={`${ids}-share`} className="min-w-0 flex-1 truncate pt-3 text-[15px] leading-5 text-ink">
            Сколько в наборе
          </span>
          <ShareStops
            options={SHARE_OPTIONS}
            value={focus?.share ?? null}
            onChange={(share) => save({ share })}
            labelledBy={`${ids}-share`}
            disabled={!focus || focus.target === "normal"}
            className="w-[320px] shrink-0"
          />
        </div>
      </div>
      <p className="mt-3 mb-0 text-[12px] leading-4 text-muted">{FOCUS_CAPTION}</p>
    </DeskSection>
  );
}
