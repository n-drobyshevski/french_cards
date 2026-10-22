import type { Metadata } from "next";
import { ImportScreen } from "@/components/import/ImportScreen";

export const metadata: Metadata = { title: "Импорт со скриншота · Карточки" };

/** Full-screen flow: the shell hides the tab bar on /import (components/ui/TabBar hidesTabBar). */
export default function ImportPage() {
  return <ImportScreen />;
}
