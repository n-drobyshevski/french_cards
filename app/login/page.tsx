import type { Metadata } from "next";
import { LoginScreen } from "@/components/auth/LoginScreen";
import { ThemeSync } from "@/components/providers/theme";

export const metadata: Metadata = {
  title: "Вход — Карточки",
};

export default function LoginPage() {
  return (
    <>
      <ThemeSync />
      <LoginScreen />
    </>
  );
}
