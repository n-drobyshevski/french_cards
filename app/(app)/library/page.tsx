import type { Metadata } from "next";
import { LibraryScreen } from "@/components/library/LibraryScreen";
import { APP_NAME } from "@/lib/brand";

export const metadata: Metadata = { title: `Библиотека · ${APP_NAME}` };

export default function LibraryPage() {
  return <LibraryScreen />;
}
