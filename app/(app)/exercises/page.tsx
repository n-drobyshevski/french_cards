import type { Metadata } from "next";
import { ExercisesScreen } from "@/components/exercises/ExercisesScreen";
import { APP_NAME } from "@/lib/brand";

export const metadata: Metadata = { title: `Упражнения · ${APP_NAME}` };

/** «Упражнения»: the sets Claude wrote in the chat, played offline from the device. */
export default function ExercisesPage() {
  return <ExercisesScreen />;
}
