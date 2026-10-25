import type { Metadata } from "next";
import { FieldsSettingsScreen } from "@/components/settings/PhoneSettingsPages";
import { APP_NAME } from "@/lib/brand";

export const metadata: Metadata = { title: `Свои поля — ${APP_NAME}` };

/** Settings → «Свои поля» on phones (a static route: it opens offline from the shell cache); from 768 the settings page at its section. */
export default function FieldsSettingsPage() {
  return <FieldsSettingsScreen />;
}
