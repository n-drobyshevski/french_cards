import type { Metadata } from "next";
import { StudyPlanScreen } from "@/components/settings/StudyPlanScreen";
import { APP_NAME } from "@/lib/brand";

export const metadata: Metadata = { title: `План повторения — ${APP_NAME}` };

/** Settings → «Повторение» → «План повторения» (a static route: it opens offline from the shell cache). */
export default function StudyPlanPage() {
  return <StudyPlanScreen />;
}
