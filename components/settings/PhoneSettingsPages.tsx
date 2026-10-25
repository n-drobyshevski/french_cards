"use client";

// The phone sub-screens of Settings (pick S1 B; boards L-Settings-B-Review / -Exercises / -AI /
// -Fields / -Data): each opens from a row of the index (/settings) and is built like /settings/plan —
// a back arrow «Назад к настройкам», a large title, the Библиотека tab still current. The settings
// are the same rows and stores as before; only where they sit has changed. From 768 up there are no
// sub-screens: the route opens the one desktop page at its section (/settings#set-…).
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { InstallHint } from "@/components/pwa/InstallHint";
import { DIRECTION_LABELS } from "@/components/review/format";
import { Button } from "@/components/ui/Button";
import { Collapse } from "@/components/ui/Collapse";
import { Header } from "@/components/ui/Header";
import { Icon } from "@/components/ui/Icons";
import { Segmented } from "@/components/ui/Segmented";
import { useSnackbar } from "@/components/ui/Snackbar";
import { Toggle } from "@/components/ui/Toggle";
import { haptic, hapticSupport } from "@/lib/haptics";
import type { Settings } from "@/lib/types";
import { useLayoutClass } from "@/lib/use-media";
import { CustomFieldsSection } from "./CustomFieldsSection";
import { DataSection } from "./DataSection";
import { DirectionSheet } from "./DirectionSheet";
import { PhoneExerciseSection } from "./ExerciseFocusSection";
import { SETTINGS_PAGES } from "./format";
import { forgetOpenedFromIndex, SettingsButtonRow, SettingsRow, wasOpenedFromIndex } from "./SettingsList";
import { SettingsScreen, useSettingsForm } from "./SettingsScreen";
import { Valued } from "./Valued";

const GRADE_OPTIONS = [
  { value: 2, label: "2", ariaLabel: "Две кнопки: Не знаю и Знаю" },
  { value: 3, label: "3", ariaLabel: "Три кнопки: Не знаю, Сложно и Знаю" },
] as const;

const COUNT_OPTIONS = [
  { value: 1, label: "1", ariaLabel: "Один вариант" },
  { value: 2, label: "2", ariaLabel: "Два варианта" },
  { value: 3, label: "3", ariaLabel: "Три варианта" },
] as const;

const REGISTER_OPTIONS = [
  { value: "slang", label: "Сленг", ariaLabel: "Сначала сленг" },
  { value: "any", label: "Любой", ariaLabel: "Разные регистры" },
  { value: "neutral", label: "Нейтр.", ariaLabel: "Сначала нейтральное слово" },
] as const;

/** «Точнее» says what it costs in its name, too. */
const MODEL_OPTIONS = [
  { value: "fast", label: "Быстрее" },
  { value: "accurate", label: "Точнее", ariaLabel: "Точнее: медленнее, зато реже ошибается с переводом и уровнем сленга" },
] as const;

const MODEL_WORDS: Record<Settings["ai_model"], string> = { fast: "быстрее", accurate: "точнее" };
const MODEL_COST = "«Точнее» отвечает медленнее, зато реже ошибается с переводом и уровнем сленга.";
const PRIVACY = "Слова и скриншоты отправляются в Anthropic (Claude) для подсказок и не хранятся там.";

type PageKey = keyof typeof SETTINGS_PAGES;

/**
 * A sub-screen's frame: on phones the header (back to the index, large title) and the content;
 * from 768 up the desktop settings page, moved to `/settings#<section>` at once.
 */
function SettingsSubScreen({ page, title, children }: { page: PageKey; title: string; children: ReactNode }) {
  const router = useRouter();
  const wide = useLayoutClass() !== "compact";
  // Opened from the index, the arrow goes back in history (the index is the entry before);
  // from a deep link (the library's sync mark, the request builder) it opens the index instead.
  const [fromIndex] = useState(wasOpenedFromIndex);
  useEffect(forgetOpenedFromIndex, []);
  useEffect(() => {
    if (wide) router.replace(`/settings#${SETTINGS_PAGES[page].anchor}`);
  }, [wide, page, router]);

  if (wide) return <SettingsScreen />;
  return (
    <div className="contents md:hidden">
      <Header
        large
        title={title}
        backLabel="Назад к настройкам"
        back={() => (fromIndex && window.history.length > 1 ? router.back() : router.replace("/settings"))}
      />
      <main className="flex flex-1 flex-col px-4 pb-6">{children}</main>
    </div>
  );
}

/** /settings/review «Повторение»: direction (its sheet), grade buttons, swipes, vibration, origin. */
export function ReviewSettingsScreen() {
  const { settings, known, save, onDirection } = useSettingsForm();
  const [directionOpen, setDirectionOpen] = useState(false);
  const toast = useSnackbar();
  const row = "border-b border-rule";
  return (
    <SettingsSubScreen page="review" title="Повторение">
      <Valued known={known}>
        <div className="mt-3 flex shrink-0 flex-col border-t border-ink">
          <SettingsButtonRow
            tall
            label="Направление по умолчанию"
            aria-haspopup="dialog"
            onClick={() => setDirectionOpen(true)}
            className={row}
            trailing={
              <>
                <span data-value="" className="font-mono text-[12px] leading-4 tracking-[.06em] whitespace-nowrap text-muted">
                  {DIRECTION_LABELS[settings.default_direction]}
                </span>
                <Icon name="chevron-right" size={16} strokeWidth={1.75} className="-mr-0.5 shrink-0 text-muted" />
              </>
            }
          />
          <SettingsRow tall label="Кнопки оценки" labelId="grade-buttons-label" className={row}>
            <Segmented
              mono
              ariaLabelledby="grade-buttons-label"
              options={GRADE_OPTIONS}
              value={settings.grade_buttons}
              onChange={(value) => save({ grade_buttons: value })}
            />
          </SettingsRow>
          <SettingsRow tall label="Свайпы для оценки" labelId="swipe-label" className={row}>
            <Toggle aria-labelledby="swipe-label" checked={settings.swipe_grading} onCheckedChange={(checked) => save({ swipe_grading: checked })} />
          </SettingsRow>
          {/* «Вибрация» covers more than swipes: grades, toggles, long presses (T8, §5.13). */}
          <SettingsRow tall label="Вибрация" labelId="haptics-label" className={row}>
            <Button
              variant="tertiary"
              size="sm"
              className="text-[13px] font-normal! text-muted! decoration-rule!"
              disabled={!settings.haptics}
              onClick={() => {
                if (hapticSupport() === "none") toast.show({ message: "Этот браузер не умеет вибрировать" });
                else haptic("again");
              }}
            >
              Проверить
            </Button>
            <Toggle aria-labelledby="haptics-label" checked={settings.haptics} onCheckedChange={(checked) => save({ haptics: checked })} />
          </SettingsRow>
          <SettingsRow tall label="Происхождение слов" labelId="origin-label" caption="В библиотеке и на обороте карточки" captionId="origin-caption" className={row}>
            <Toggle
              aria-labelledby="origin-label"
              aria-describedby="origin-caption"
              checked={settings.origin_visible}
              onCheckedChange={(checked) => save({ origin_visible: checked })}
            />
          </SettingsRow>
        </div>
      </Valued>
      <DirectionSheet open={directionOpen} onOpenChange={setDirectionOpen} value={settings.default_direction} onChange={onDirection} />
    </SettingsSubScreen>
  );
}

/** /settings/exercises «Упражнения»: «Чаще в упражнениях» and «Сколько в наборе» (synced). */
export function ExercisesSettingsScreen() {
  return (
    <SettingsSubScreen page="exercises" title="Упражнения">
      <div aria-hidden="true" className="mt-3 shrink-0 border-t border-ink" />
      <PhoneExerciseSection />
    </SettingsSubScreen>
  );
}

/**
 * /settings/ai «ИИ»: the five switches; «Вариантов» and «Регистр вариантов» indented under
 * «Автоподсказки при вводе», open only while it is on; one «Модель» for the suggestions and the
 * screenshots (two stored settings: a choice sets both; while they differ nothing is selected and
 * the caption says which is which); the privacy line once at the bottom.
 */
export function AiSettingsScreen() {
  const { settings, known, save } = useSettingsForm();
  const row = "border-b border-rule";
  const sameModel = settings.ai_model === settings.ai_model_extract;
  const switchRow = (label: string, id: string, key: "suggestions_enabled" | "slang_detect_enabled" | "examples_enabled" | "auto_sort_enabled" | "notes_enabled") => (
    <SettingsRow label={label} labelId={id} className={row}>
      <Toggle aria-labelledby={id} checked={settings[key]} onCheckedChange={(checked) => save({ [key]: checked })} />
    </SettingsRow>
  );
  return (
    <SettingsSubScreen page="ai" title="ИИ">
      <Valued known={known}>
        <div className="mt-4 flex shrink-0 flex-col border-t border-rule">
          {switchRow("Автоподсказки при вводе", "hints-label", "suggestions_enabled")}
          <Collapse open={settings.suggestions_enabled}>
            <div className="flex flex-col">
              <SettingsRow label="Вариантов" labelId="count-label" className={`${row} pl-3`}>
                <Segmented
                  mono
                  ariaLabelledby="count-label"
                  options={COUNT_OPTIONS}
                  value={settings.suggest_count}
                  onChange={(suggest_count) => save({ suggest_count })}
                />
              </SettingsRow>
              <SettingsRow label="Регистр вариантов" labelId="register-label" className={`${row} pl-3`}>
                <Segmented
                  ariaLabelledby="register-label"
                  options={REGISTER_OPTIONS}
                  value={settings.suggest_register}
                  onChange={(suggest_register) => save({ suggest_register })}
                />
              </SettingsRow>
            </div>
          </Collapse>
          {switchRow("Определять уровень сленга", "slang-detect-label", "slang_detect_enabled")}
          {switchRow("Подбирать примеры", "examples-label", "examples_enabled")}
          {switchRow("Раскладывать по темам автоматически", "sort-label", "auto_sort_enabled")}
          {switchRow("Писать заметки", "notes-label", "notes_enabled")}
        </div>

        <div className="mt-6 flex shrink-0 flex-col border-y border-rule pb-3">
          <SettingsRow label="Модель" labelId="model-label">
            <Segmented
              ariaLabelledby="model-label"
              options={MODEL_OPTIONS}
              value={sameModel ? settings.ai_model : null}
              onChange={(model) => save({ ai_model: model, ai_model_extract: model })}
            />
          </SettingsRow>
          <p id="model-caption" className="m-0 text-[12px] leading-4 text-muted">
            {sameModel
              ? `Для подсказок и скриншотов. ${MODEL_COST}`
              : `Сейчас подсказки — ${MODEL_WORDS[settings.ai_model]}, скриншоты — ${MODEL_WORDS[settings.ai_model_extract]}; выбор задаст обе. ${MODEL_COST}`}
          </p>
        </div>
      </Valued>
      <p className="m-0 mt-4 shrink-0 text-[12px] leading-4 text-muted">{PRIVACY}</p>
    </SettingsSubScreen>
  );
}

/** /settings/fields «Свои поля». */
export function FieldsSettingsScreen() {
  return (
    <SettingsSubScreen page="fields" title="Свои поля">
      <CustomFieldsSection />
    </SettingsSubScreen>
  );
}

/** /settings/data «Данные»: sync, backup, imports, sign-out; the install hint (iOS Safari) last. */
export function DataSettingsScreen() {
  return (
    <SettingsSubScreen page="data" title="Данные">
      <DataSection />
      <InstallHint placement="inline" className="mt-6" />
    </SettingsSubScreen>
  );
}
