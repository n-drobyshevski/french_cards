import type { Metadata } from "next";
import { ResetPasswordScreen } from "@/components/auth/ResetPasswordScreen";
import { ThemeSync } from "@/components/providers/theme";
import { APP_NAME } from "@/lib/brand";

export const metadata: Metadata = {
  title: `Новый пароль — ${APP_NAME}`,
};

export default function ResetPasswordPage() {
  return (
    <>
      <ThemeSync />
      <ResetPasswordScreen />
    </>
  );
}
