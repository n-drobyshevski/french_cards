import type { Metadata } from "next";
import { ResetPasswordScreen } from "@/components/auth/ResetPasswordScreen";
import { ThemeSync } from "@/components/providers/theme";

export const metadata: Metadata = {
  title: "Новый пароль — Карточки",
};

export default function ResetPasswordPage() {
  return (
    <>
      <ThemeSync />
      <ResetPasswordScreen />
    </>
  );
}
