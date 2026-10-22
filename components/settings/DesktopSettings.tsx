"use client";

// «Настройки» from 768 up (DESKTOP-SPEC §2 pane widths, board 20 D-Settings): title, a section nav
// with scroll-spy (≥ 1200 only) and a 640px form. Checkboxes replace the phone's toggles; theme and
// grade buttons are text options; the «Клавиши» section exists only here (phones have no keys).
import { useShell } from "@/components/shell/ShellContext";
import { cx } from "@/components/ui/cx";
import { FlatKey } from "@/components/ui/Kbd";
import type { Direction, Settings } from "@/lib/types";
import { DataSection } from "./DataSection";
import { CheckboxRow, DeskRow, DeskSection, DeskStepper, DirectionSelect, TextOptions } from "./DesktopControls";
import { NEW_PER_DAY_MAX, stepNewPerDay } from "./format";
import { useSectionSpy } from "./useSectionSpy";

export const DESK_SECTIONS = [
  { id: "set-review", title: "Повторение" },
  { id: "set-look", title: "Оформление" },
  { id: "set-hints", title: "Подсказки" },
  { id: "set-keys", title: "Клавиши" },
  { id: "set-data", title: "Данные" },
] as const;

const SECTION_IDS = DESK_SECTIONS.map((s) => s.id);

const THEME_OPTIONS = [
  { value: "system", label: "Система" },
  { value: "light", label: "Светлая" },
  { value: "dark", label: "Тёмная" },
] as const;

const GRADE_OPTIONS = [
  { value: 2, label: "2", ariaLabel: "Две кнопки: Не знаю и Знаю" },
  { value: 3, label: "3", ariaLabel: "Три кнопки: Не знаю, Сложно и Знаю" },
] as const;

const SINGLE_KEYS = ["N", "/", "J", "K", "X", "M"];

export interface DesktopSettingsProps {
  settings: Settings;
  loading: boolean;
  save: (patch: Partial<Omit<Settings, "id">>) => void;
  onTheme: (theme: Settings["theme"]) => void;
  onDirection: (direction: Direction) => void;
}

function SectionNav() {
  const { active, go } = useSectionSpy(SECTION_IDS);
  return (
    <nav aria-label="Разделы настроек" className="sticky top-6 -mt-[3px] -ml-3 hidden w-[188px] flex-col self-start xl:flex">
      {DESK_SECTIONS.map((s) => {
        const current = s.id === active;
        return (
          <a
            key={s.id}
            href={`#${s.id}`}
            aria-current={current ? "true" : undefined}
            onClick={(event) => {
              if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
              event.preventDefault();
              go(s.id);
            }}
            className={cx(
              "relative flex h-8 items-center rounded-[4px] px-3 text-[14px] text-ink no-underline hoverable:bg-hover focus-visible:outline-offset-[-2px]",
              current ? "font-semibold" : "font-medium",
            )}
          >
            {current && <span aria-hidden="true" className="absolute inset-y-0 left-0 w-0.5 bg-ink" />}
            {s.title}
          </a>
        );
      })}
    </nav>
  );
}

export function DesktopSettings({ settings, loading, save, onTheme, onDirection }: DesktopSettingsProps) {
  const { openShortcuts } = useShell();
  return (
    <main
      data-wide=""
      aria-labelledby="settings-title"
      className="flex flex-1 flex-col px-8 pt-8 pb-12 xl:px-12 xl:pt-10"
    >
      <h1 id="settings-title" className="m-0 font-serif text-[28px] leading-9 font-medium tracking-[-0.015em] text-ink">
        Настройки
      </h1>
      <div className="mt-9 flex items-start gap-12">
        <SectionNav />
        <div className="w-full max-w-[640px] min-w-0">
          <DeskSection id="set-review" title="Повторение" first>
            <DeskRow label="Направление по умолчанию" labelId="set-dir-label">
              <DirectionSelect value={settings.default_direction} onChange={onDirection} labelId="set-dir-label" disabled={loading} />
            </DeskRow>
            <DeskRow label="Новых карточек в день" labelId="set-new-label">
              <DeskStepper
                labelledBy="set-new-label"
                value={settings.new_per_day}
                max={NEW_PER_DAY_MAX}
                disabled={loading}
                onStep={(delta) => save({ new_per_day: stepNewPerDay(settings.new_per_day, delta) })}
              />
            </DeskRow>
            <DeskRow label="Кнопки оценки" labelId="set-grade-label">
              <TextOptions
                ariaLabelledby="set-grade-label"
                options={GRADE_OPTIONS}
                value={settings.grade_buttons}
                disabled={loading}
                onChange={(value) => save({ grade_buttons: value })}
              />
            </DeskRow>
            <CheckboxRow
              label="Свайпы для оценки"
              checked={settings.swipe_grading}
              disabled={loading}
              onCheckedChange={(checked) => save({ swipe_grading: checked })}
            />
          </DeskSection>

          <DeskSection id="set-look" title="Оформление">
            <DeskRow label="Тема" labelId="set-theme-label">
              <TextOptions ariaLabelledby="set-theme-label" options={THEME_OPTIONS} value={settings.theme} disabled={loading} onChange={onTheme} />
            </DeskRow>
          </DeskSection>

          <DeskSection id="set-hints" title="Подсказки">
            <CheckboxRow
              label="Автоподсказки при вводе"
              checked={settings.suggestions_enabled}
              disabled={loading}
              onCheckedChange={(checked) => save({ suggestions_enabled: checked })}
            />
            <CheckboxRow
              label="Раскладывать по темам автоматически"
              checked={settings.auto_sort_enabled}
              disabled={loading}
              onCheckedChange={(checked) => save({ auto_sort_enabled: checked })}
            />
            <p className="mt-3 mb-0 text-[12px] leading-4 text-muted">
              Слова и скриншоты отправляются в Anthropic (Claude) для подсказок и не хранятся там.
            </p>
          </DeskSection>

          <DeskSection id="set-keys" title="Клавиши">
            <CheckboxRow
              label="Однобуквенные сочетания"
              caption={
                <>
                  {SINGLE_KEYS.map((k, i) => (
                    <span key={k}>
                      {i > 0 && ", "}
                      <FlatKey className="leading-none">{k}</FlatKey>
                    </span>
                  ))}{" "}
                  и другие. Выключите, если мешают экранному диктору.
                </>
              }
              checked={settings.shortcuts}
              disabled={loading}
              onCheckedChange={(checked) => save({ shortcuts: checked })}
            />
            <CheckboxRow
              label="Подсказки клавиш при повторении"
              checked={settings.key_hints}
              disabled={loading}
              onCheckedChange={(checked) => save({ key_hints: checked })}
            />
            <DeskRow label="Все клавиши" labelId="set-keys-all">
              <button
                type="button"
                aria-label="Все клавиши"
                aria-keyshortcuts={settings.shortcuts ? "Shift+Slash" : undefined}
                title={settings.shortcuts ? "Все клавиши (?)" : "Все клавиши"}
                onClick={openShortcuts}
                className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-[4px] border border-boundary bg-surface p-0 font-mono text-[13px] text-ink hoverable:bg-hover-surface"
              >
                ?
              </button>
            </DeskRow>
          </DeskSection>

          <DataSection desktop />
        </div>
      </div>
    </main>
  );
}
