import type { Metadata } from "next";
import { ProgressScreen } from "@/components/progress/ProgressScreen";
import { APP_NAME } from "@/lib/brand";

export const metadata: Metadata = { title: `Прогресс · ${APP_NAME}` };

/** «Прогресс»: the study days over time (lib/progress.ts); opened from the Library header and the Done screen. */
export default function ProgressPage() {
  return <ProgressScreen />;
}
