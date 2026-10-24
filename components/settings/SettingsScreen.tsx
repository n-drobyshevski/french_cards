"use client";

import { useState } from "react";
import { InstallHint } from "@/components/pwa/InstallHint";
import { applyTheme } from "@/components/providers/theme";
import { clearReviewDirection } from "@/components/review/filter";
import { DIRECTION_LABELS } from "@/components/review/format";
import { Button } from "@/components/ui/Button";
import { Header } from "@/components/ui/Header";
import { Icon } from "@/components/ui/Icons";
import { Segmented } from "@/components/ui/Segmented";
import { useSnackbar } from "@/components/ui/Snackbar";
import { Toggle } from "@/components/ui/Toggle";
import { haptic, hapticSupport } from "@/lib/haptics";
import { updateSettings } from "@/lib/settings";
import { DEFAULT_SETTINGS, type Direction, type Settings } from "@/lib/types";
import { useLayoutClass } from "@/lib/use-media";
import { useSettings } from "@/lib/use-settings";
import { CustomFieldsSection } from "./CustomFieldsSection";
import { DataSection } from "./DataSection";
import { DesktopSettings } from "./DesktopSettings";
import { DirectionSheet } from "./DirectionSheet";
import { PhoneExerciseSection } from "./ExerciseFocusSection";
import { SettingsButtonRow, SettingsRow, SettingsSection } from "./SettingsList";
import { PhonePlanRow } from "./StudyPlanSettings";
import { Valued } from "./Valued";

const THEME_OPTIONS = [
  { value: "system", label: "Система" },
  { value: "light", label: "Светлая" },
  { value: "dark", label: "Тёмная" },
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

const MODEL_OPTIONS = [
  { value: "fast", label: "Быстрее" },
  { value: "accurate", label: "Точнее" },
] as const;

const GRADE_OPTIONS = [
  { value: 2, label: "2", ariaLabel: "Две кнопки: Не знаю и Знаю" },
  { value: 3, label: "3", ariaLabel: "Три кнопки: Не знаю, Сложно и Знаю" },
] as const;

/**
 * «Настройки»: review preferences (the «План повторения» row opens /settings/plan), «Упражнения» («Чаще в упражнениях»), theme, «ИИ» (what is filled in automatically, and how), «Свои поля» and data
 * (sync, backup, sign-out). Phones get today's list; from 768 up the desktop layout
 * (DesktopSettings). The server and hydration render the phone list, hidden from 768 up by CSS,
 * so a wide window never flashes the phone layout.
 */
export function SettingsScreen() {
  // Stored values, or their localStorage mirror in the first frame (L2); with neither (first run,
  // server render) the rows show valueless controls until Dexie answers (T1).
  const current = useSettings().settings;
  const settings: Settings = current ?? DEFAULT_SETTINGS;
  const known = current !== undefined;
  const toast = useSnackbar();
  const layout = useLayoutClass();

  const save = (patch: Partial<Omit<Settings, "id">>) => {
    updateSettings(patch).catch(() => toast.show({ message: "Не получилось сохранить настройку" }));
  };
  const onTheme = (theme: Settings["theme"]) => {
    applyTheme(theme);
    save({ theme });
  };
  const onDirection = (value: Direction) => {
    save({ default_direction: value });
    clearReviewDirection();
  };

  if (layout !== "compact") {
    return <DesktopSettings settings={settings} known={known} save={save} onTheme={onTheme} onDirection={onDirection} />;
  }
  return <PhoneSettings settings={settings} known={known} save={save} onTheme={onTheme} onDirection={onDirection} />;
}

interface ScreenProps {
  settings: Settings;
  /** False until the stored values (or their mirror) are read: controls are drawn without values. */
  known: boolean;
  save: (patch: Partial<Omit<Settings, "id">>) => void;
  onTheme: (theme: Settings["theme"]) => void;
  onDirection: (direction: Direction) => void;
}

/** The phone list (< 768), unchanged from before the desktop layout. */
function PhoneSettings({ settings, known, save, onTheme, onDirection }: ScreenProps) {
  const [directionOpen, setDirectionOpen] = useState(false);
  const toast = useSnackbar();

  return (
    <div className="contents md:hidden">
      <Header title="Настройки" fallbackHref="/" />
      <main className="flex flex-1 flex-col px-4 pb-6">
        <Valued known={known}>
          <SettingsSection title="Повторение">
            <SettingsButtonRow
              label="Направление по умолчанию"
              aria-haspopup="dialog"
           
              onClick={() => setDirectionOpen(true)}
              trailing={
                <>
                  <span data-value="" className="font-mono text-[12px] leading-4 tracking-[.06em] whitespace-nowrap text-muted">
                    {DIRECTION_LABELS[settings.default_direction]}
                  </span>
                  <Icon name="chevron-right" size={14} strokeWidth={2} className="text-muted" />
                </>
              }
            />
            {/* «План повторения ›»: synced (user_prefs), its own screen (D1 C). */}
            <PhonePlanRow />
            <SettingsRow label="Кнопки оценки" labelId="grade-buttons-label">
              <Segmented
                mono
                ariaLabelledby="grade-buttons-label"
                options={GRADE_OPTIONS}
                value={settings.grade_buttons}
                onChange={(value) => save({ grade_buttons: value })}
              />
            </SettingsRow>
            <SettingsRow label="Свайпы для оценки" labelId="swipe-label">
              <Toggle
                aria-labelledby="swipe-label"
                checked={settings.swipe_grading}
             
                onCheckedChange={(checked) => save({ swipe_grading: checked })}
              />
            </SettingsRow>
            {/* «Вибрация» covers more than swipes now: grades, toggles, long presses (T8, §5.13). */}
            <SettingsRow label="Вибрация" labelId="haptics-label" caption="При оценке, свайпах и переключателях">
              <Button
                variant="tertiary"
                size="sm"
                className="text-[13px]"
                disabled={!settings.haptics}
                onClick={() => {
                  if (hapticSupport() === "none") toast.show({ message: "Этот браузер не умеет вибрировать" });
                  else haptic("again");
                }}
              >
                Проверить
              </Button>
              <Toggle
                aria-labelledby="haptics-label"
                checked={settings.haptics}
                onCheckedChange={(checked) => save({ haptics: checked })}
              />
            </SettingsRow>
          </SettingsSection>
        </Valued>

        {/* Synced with the account (user_prefs), read on its own: not a row of this device's settings. */}
        <PhoneExerciseSection />

        <Valued known={known}>
          <SettingsSection title="Оформление">
            <SettingsRow label="Тема" labelId="theme-label">
              <Segmented
                ariaLabelledby="theme-label"
                options={THEME_OPTIONS}
                value={settings.theme}
                onChange={onTheme}
              />
            </SettingsRow>
            <SettingsRow label="Происхождение слов" labelId="origin-label" caption="В библиотеке и на обороте карточки">
              <Toggle
                aria-labelledby="origin-label"
                checked={settings.origin_visible}
                onCheckedChange={(checked) => save({ origin_visible: checked })}
              />
            </SettingsRow>
          </SettingsSection>

          <SettingsSection
            title="ИИ"
            footer={
              <div className="flex flex-col gap-1 border-t border-rule pt-2 text-[12px] leading-4 text-muted">
                <p className="m-0">«Точнее» отвечает медленнее, зато реже ошибается с переводом и уровнем сленга.</p>
                <p className="m-0">Слова и скриншоты отправляются в Anthropic (Claude) для подсказок и не хранятся там.</p>
              </div>
            }
          >
            <SettingsRow label="Автоподсказки при вводе" labelId="hints-label">
              <Toggle
                aria-labelledby="hints-label"
                checked={settings.suggestions_enabled}
             
                onCheckedChange={(checked) => save({ suggestions_enabled: checked })}
              />
            </SettingsRow>
            <SettingsRow label="Определять уровень сленга" labelId="slang-detect-label">
              <Toggle
                aria-labelledby="slang-detect-label"
                checked={settings.slang_detect_enabled}
             
                onCheckedChange={(checked) => save({ slang_detect_enabled: checked })}
              />
            </SettingsRow>
            <SettingsRow label="Подбирать примеры" labelId="examples-label">
              <Toggle
                aria-labelledby="examples-label"
                checked={settings.examples_enabled}
             
                onCheckedChange={(checked) => save({ examples_enabled: checked })}
              />
            </SettingsRow>
            <SettingsRow label="Раскладывать по темам автоматически" labelId="sort-label">
              <Toggle
                aria-labelledby="sort-label"
                checked={settings.auto_sort_enabled}
             
                onCheckedChange={(checked) => save({ auto_sort_enabled: checked })}
              />
            </SettingsRow>
            <SettingsRow label="Писать заметки" labelId="notes-label">
              <Toggle
                aria-labelledby="notes-label"
                checked={settings.notes_enabled}
             
                onCheckedChange={(checked) => save({ notes_enabled: checked })}
              />
            </SettingsRow>
            <SettingsRow label="Вариантов" labelId="count-label">
              <Segmented
                ariaLabelledby="count-label"
                options={COUNT_OPTIONS}
                value={settings.suggest_count}
                onChange={(suggest_count) => save({ suggest_count })}
                mono
              />
            </SettingsRow>
            <SettingsRow label="Регистр вариантов" labelId="register-label">
              <Segmented
                ariaLabelledby="register-label"
                options={REGISTER_OPTIONS}
                value={settings.suggest_register}
                onChange={(suggest_register) => save({ suggest_register })}
              />
            </SettingsRow>
            <SettingsRow label="Модель: подсказки" labelId="model-label">
              <Segmented ariaLabelledby="model-label" options={MODEL_OPTIONS} value={settings.ai_model} onChange={(ai_model) => save({ ai_model })} />
            </SettingsRow>
            <SettingsRow label="Модель: скриншоты" labelId="model-extract-label">
              <Segmented
                ariaLabelledby="model-extract-label"
                options={MODEL_OPTIONS}
                value={settings.ai_model_extract}
                onChange={(ai_model_extract) => save({ ai_model_extract })}
              />
            </SettingsRow>
          </SettingsSection>
        </Valued>

        <CustomFieldsSection />

        <DataSection />

        <InstallHint placement="inline" className="mt-6" />
      </main>

      <DirectionSheet
        open={directionOpen}
        onOpenChange={setDirectionOpen}
        value={settings.default_direction}
        onChange={onDirection}
      />
    </div>
  );
}
