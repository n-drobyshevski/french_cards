import type { Metadata } from "next";
import { ExercisesSettingsScreen } from "@/components/settings/PhoneSettingsPages";
import { APP_NAME } from "@/lib/brand";

export const metadata: Metadata = { title: `Упражнения — ${APP_NAME}` };

/** Settings → «Упражнения» on phones (a static route: it opens offline from the shell cache); from 768 the settings page at its section. */
export default function ExercisesSettingsPage() {
  return <ExercisesSettingsScreen />;
}
