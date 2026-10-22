import type { Metadata } from "next";
import { SettingsScreen } from "@/components/settings/SettingsScreen";
import { APP_NAME } from "@/lib/brand";

export const metadata: Metadata = { title: `Настройки — ${APP_NAME}` };

export default function SettingsPage() {
  return <SettingsScreen />;
}
