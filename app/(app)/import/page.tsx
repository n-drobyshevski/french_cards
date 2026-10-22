import type { Metadata } from "next";
import { ImportScreen } from "@/components/import/ImportScreen";
import { APP_NAME } from "@/lib/brand";

export const metadata: Metadata = { title: `Импорт со скриншота · ${APP_NAME}` };

/** Full-screen flow: the shell hides the tab bar on /import (components/ui/TabBar hidesTabBar). */
export default function ImportPage() {
  return <ImportScreen />;
}
