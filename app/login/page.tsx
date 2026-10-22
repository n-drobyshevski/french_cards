import type { Metadata } from "next";
import { LoginScreen } from "@/components/auth/LoginScreen";
import { ThemeSync } from "@/components/providers/theme";
import { APP_NAME } from "@/lib/brand";

export const metadata: Metadata = {
  title: `Вход — ${APP_NAME}`,
};

export default function LoginPage() {
  return (
    <>
      <ThemeSync />
      <LoginScreen />
    </>
  );
}
