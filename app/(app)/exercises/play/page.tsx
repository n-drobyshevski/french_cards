import type { Metadata } from "next";
import { ExercisePlayer } from "@/components/exercises/ExercisePlayer";
import { APP_NAME } from "@/lib/brand";

export const metadata: Metadata = { title: `Упражнение · ${APP_NAME}` };

/**
 * The exercise player. A static route, so it opens on an offline cold start: the set comes from the
 * hand-over in components/exercises/exercise-request.ts, else ?set=<id> (read on the client), else
 * the newest unfinished run (components/exercises/ExercisePlayer).
 */
export default function ExercisePlayPage() {
  return <ExercisePlayer />;
}
