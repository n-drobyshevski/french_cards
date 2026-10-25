import type { Metadata } from "next";
import { DataSettingsScreen } from "@/components/settings/PhoneSettingsPages";
import { APP_NAME } from "@/lib/brand";

export const metadata: Metadata = { title: `Данные — ${APP_NAME}` };

/** Settings → «Данные» on phones (a static route: it opens offline from the shell cache); from 768 the settings page at its section. */
export default function DataSettingsPage() {
  return <DataSettingsScreen />;
}
