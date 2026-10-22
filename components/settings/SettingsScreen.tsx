"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { InstallHint } from "@/components/pwa/InstallHint";
import { applyTheme } from "@/components/providers/theme";
import { clearReviewDirection } from "@/components/review/filter";
import { DIRECTION_LABELS } from "@/components/review/format";
import { Header } from "@/components/ui/Header";
import { Icon } from "@/components/ui/Icons";
import { Segmented } from "@/components/ui/Segmented";
import { useSnackbar } from "@/components/ui/Snackbar";
import { Toggle } from "@/components/ui/Toggle";
import { getSettings, updateSettings } from "@/lib/settings";
import { DEFAULT_SETTINGS, type Direction, type Settings } from "@/lib/types";
import { useLayoutClass } from "@/lib/use-media";
import { DataSection } from "./DataSection";
import { DesktopSettings } from "./DesktopSettings";
import { DirectionSheet } from "./DirectionSheet";
import { NEW_PER_DAY_MAX, stepNewPerDay } from "./format";
import { SettingsButtonRow, SettingsRow, SettingsSection } from "./SettingsList";
import { Stepper } from "./Stepper";

const THEME_OPTIONS = [
  { value: "system", label: "Система" },
  { value: "light", label: "Светлая" },
  { value: "dark", label: "Тёмная" },
] as const;

const GRADE_OPTIONS = [
  { value: 2, label: "2", ariaLabel: "Две кнопки: Не знаю и Знаю" },
  { value: 3, label: "3", ariaLabel: "Три кнопки: Не знаю, Сложно и Знаю" },
] as const;

/**
 * «Настройки»: review preferences, theme, suggestions and data (sync, backup, sign-out). Phones get
 * today's list; from 768 up the desktop layout (DesktopSettings). The server and hydration render
 * the phone list, hidden from 768 up by CSS, so a wide window never flashes the phone layout.
 */
export function SettingsScreen() {
  const stored = useLiveQuery(() => getSettings(), []);
  const settings: Settings = stored ?? DEFAULT_SETTINGS;
  const loading = stored === undefined;
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
    return <DesktopSettings settings={settings} loading={loading} save={save} onTheme={onTheme} onDirection={onDirection} />;
  }
  return <PhoneSettings settings={settings} loading={loading} save={save} onTheme={onTheme} onDirection={onDirection} />;
}

interface ScreenProps {
  settings: Settings;
  loading: boolean;
  save: (patch: Partial<Omit<Settings, "id">>) => void;
  onTheme: (theme: Settings["theme"]) => void;
  onDirection: (direction: Direction) => void;
}

/** The phone list (< 768), unchanged from before the desktop layout. */
function PhoneSettings({ settings, loading, save, onTheme, onDirection }: ScreenProps) {
  const [directionOpen, setDirectionOpen] = useState(false);

  return (
    <div className="contents md:hidden">
      <Header title="Настройки" fallbackHref="/" />
      <main className="flex flex-1 flex-col px-4 pb-6">
        <SettingsSection title="Повторение">
          <SettingsButtonRow
            label="Направление по умолчанию"
            aria-haspopup="dialog"
            disabled={loading}
            onClick={() => setDirectionOpen(true)}
            trailing={
              <>
                <span className="font-mono text-[12px] leading-4 tracking-[.06em] whitespace-nowrap text-muted">
                  {DIRECTION_LABELS[settings.default_direction]}
                </span>
                <Icon name="chevron-right" size={14} strokeWidth={2} className="text-muted" />
              </>
            }
          />
          <SettingsRow label="Новых карточек в день">
            <Stepper
              label="Новых карточек в день"
              value={settings.new_per_day}
              max={NEW_PER_DAY_MAX}
              disabled={loading}
              onStep={(delta) => save({ new_per_day: stepNewPerDay(settings.new_per_day, delta) })}
            />
          </SettingsRow>
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
              disabled={loading}
              onCheckedChange={(checked) => save({ swipe_grading: checked })}
            />
          </SettingsRow>
          <SettingsRow label="Вибрация при свайпах" labelId="haptics-label">
            <Toggle
              aria-labelledby="haptics-label"
              checked={settings.haptics}
              disabled={loading || !settings.swipe_grading}
              onCheckedChange={(checked) => save({ haptics: checked })}
            />
          </SettingsRow>
        </SettingsSection>

        <SettingsSection title="Оформление">
          <SettingsRow label="Тема" labelId="theme-label">
            <Segmented
              ariaLabelledby="theme-label"
              options={THEME_OPTIONS}
              value={settings.theme}
              onChange={onTheme}
            />
          </SettingsRow>
        </SettingsSection>

        <SettingsSection
          title="Подсказки"
          footer={
            <p className="m-0 border-t border-rule pt-2 text-[12px] leading-4 text-muted">
              Слова и скриншоты отправляются в Anthropic (Claude) для подсказок и не хранятся там.
            </p>
          }
        >
          <SettingsRow label="Автоподсказки при вводе" labelId="hints-label">
            <Toggle
              aria-labelledby="hints-label"
              checked={settings.suggestions_enabled}
              disabled={loading}
              onCheckedChange={(checked) => save({ suggestions_enabled: checked })}
            />
          </SettingsRow>
          <SettingsRow label="Раскладывать по темам автоматически" labelId="sort-label">
            <Toggle
              aria-labelledby="sort-label"
              checked={settings.auto_sort_enabled}
              disabled={loading}
              onCheckedChange={(checked) => save({ auto_sort_enabled: checked })}
            />
          </SettingsRow>
        </SettingsSection>

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
