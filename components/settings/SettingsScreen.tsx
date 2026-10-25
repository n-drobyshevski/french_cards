"use client";

import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { useEffect } from "react";
import { applyTheme } from "@/components/providers/theme";
import { clearReviewDirection } from "@/components/review/filter";
import { PLAN_SETTINGS_HREF } from "@/components/review/plan-format";
import { Header } from "@/components/ui/Header";
import { Segmented } from "@/components/ui/Segmented";
import { useSnackbar } from "@/components/ui/Snackbar";
import { cx } from "@/components/ui/cx";
import { listFieldDefs } from "@/lib/custom-fields";
import { updateSettings } from "@/lib/settings";
import { DEFAULT_SETTINGS, type Direction, type Settings } from "@/lib/types";
import { MEDIUM_QUERY, useLayoutClass } from "@/lib/use-media";
import { useSettings } from "@/lib/use-settings";
import { useExerciseFocus, useStudyPlan } from "@/lib/user-prefs";
import { SYNC_DOT } from "./DataSection";
import { DesktopSettings } from "./DesktopSettings";
import { aiCaption, exercisesCaption, fieldsCaption, planCaption, reviewCaption, SETTINGS_PAGES, settingsPageForAnchor } from "./format";
import { SettingsIndexRow } from "./SettingsList";
import { useSyncLine } from "./useSyncLine";
import { Valued } from "./Valued";

const THEME_OPTIONS = [
  { value: "system", label: "Система" },
  { value: "light", label: "Светлая" },
  { value: "dark", label: "Тёмная" },
] as const;

/** The device settings as the screens edit them: values, whether they are known yet, savers. */
export function useSettingsForm(): ScreenProps {
  // Stored values, or their localStorage mirror in the first frame (L2); with neither (first run,
  // server render) the rows show valueless controls until Dexie answers (T1).
  const current = useSettings().settings;
  const settings: Settings = current ?? DEFAULT_SETTINGS;
  const known = current !== undefined;
  const toast = useSnackbar();

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
  return { settings, known, save, onTheme, onDirection };
}

/**
 * «Настройки». Phones (pick S1 B): an index of seven rows, each with its current values, that open
 * the sub-screens /settings/plan, /review, /exercises, /ai, /fields and /data; «Тема» is the one
 * control kept inline. From 768 up the one desktop page (DesktopSettings). The server and hydration
 * render the phone index, hidden from 768 up by CSS, so a wide window never flashes it.
 */
export function SettingsScreen() {
  const form = useSettingsForm();
  const layout = useLayoutClass();
  if (layout !== "compact") return <DesktopSettings {...form} />;
  return <PhoneSettings {...form} />;
}

export interface ScreenProps {
  settings: Settings;
  /** False until the stored values (or their mirror) are read: controls are drawn without values. */
  known: boolean;
  save: (patch: Partial<Omit<Settings, "id">>) => void;
  onTheme: (theme: Settings["theme"]) => void;
  onDirection: (direction: Direction) => void;
}

/**
 * The phone index (board L-Settings-B): under the large title one ink rule, then hairline rows —
 * the name in Newsreader 19 and its current values as a 12px caption, › to the sub-screen. No
 * section headings. Opened by an old section link (/settings#set-data), it goes on to that
 * section's sub-screen.
 */
function PhoneSettings({ settings, known, onTheme }: ScreenProps) {
  const router = useRouter();
  const plan = useStudyPlan();
  const focus = useExerciseFocus();
  // Undefined while loading: no caption yet rather than a wrong «Нет полей».
  const fields = useLiveQuery(() => listFieldDefs(), []);
  const { line } = useSyncLine();

  useEffect(() => {
    const forward = () => {
      // Phones only: during hydration a wide window renders this list too.
      if (window.matchMedia(MEDIUM_QUERY).matches) return;
      const page = settingsPageForAnchor(window.location.hash);
      if (page) router.replace(page);
    };
    forward();
    window.addEventListener("hashchange", forward);
    return () => window.removeEventListener("hashchange", forward);
  }, [router]);

  const themeRow = (
    <div className="flex min-h-16 shrink-0 items-center gap-2.5 border-b border-rule">
      <span id="theme-label" className="min-w-0 flex-1 font-serif text-[19px] leading-6 font-medium">
        Тема
      </span>
      <Segmented ariaLabelledby="theme-label" options={THEME_OPTIONS} value={settings.theme} onChange={onTheme} />
    </div>
  );

  return (
    <div className="contents md:hidden">
      <Header large title="Настройки" fallbackHref="/" />
      <main className="flex flex-1 flex-col px-4 pb-6">
        <div className="mt-3 flex shrink-0 flex-col border-t border-ink">
          <SettingsIndexRow href={PLAN_SETTINGS_HREF} label="План повторения" captionText={plan ? planCaption(plan) : ""} />
          <SettingsIndexRow href={SETTINGS_PAGES.review.href} label="Повторение" captionText={known ? reviewCaption(settings) : ""} />
          <SettingsIndexRow href={SETTINGS_PAGES.exercises.href} label="Упражнения" captionText={focus ? exercisesCaption(focus) : ""} />
          <Valued known={known}>{themeRow}</Valued>
          <SettingsIndexRow href={SETTINGS_PAGES.ai.href} label="ИИ" captionText={known ? aiCaption(settings) : ""} />
          {/* Dashed while there is no field: nothing on record yet. */}
          <SettingsIndexRow
            href={SETTINGS_PAGES.fields.href}
            label="Свои поля"
            captionText={fields ? fieldsCaption(fields.map((d) => d.name)) : ""}
            dashed={fields?.length === 0}
          />
          <SettingsIndexRow
            href={SETTINGS_PAGES.data.href}
            label="Данные"
            captionText={line.text}
            caption={
              line.text ? (
                <span className="flex min-w-0 items-center gap-1.5">
                  <span aria-hidden="true" className={cx("size-1.5 shrink-0 rounded-[1px] transition-colors duration-(--dur-quick)", SYNC_DOT[line.tone])} />
                  <span className={cx("min-w-0 truncate", line.tone === "again" && "text-again")}>{line.text}</span>
                </span>
              ) : undefined
            }
          />
        </div>
      </main>
    </div>
  );
}
