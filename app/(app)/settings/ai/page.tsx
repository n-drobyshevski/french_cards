import type { Metadata } from "next";
import { AiSettingsScreen } from "@/components/settings/PhoneSettingsPages";
import { APP_NAME } from "@/lib/brand";

export const metadata: Metadata = { title: `ИИ — ${APP_NAME}` };

/** Settings → «ИИ» on phones (a static route: it opens offline from the shell cache); from 768 the settings page at its section. */
export default function AiSettingsPage() {
  return <AiSettingsScreen />;
}
