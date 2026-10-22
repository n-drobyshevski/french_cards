import type { Metadata } from "next";
import { Suspense } from "react";
import { ContextScreen } from "@/components/context/ContextScreen";
import { APP_NAME } from "@/lib/brand";

export const metadata: Metadata = { title: `Контекст · ${APP_NAME}` };

/** «Контекст»: /context?q=kiffer. The query lives in the URL (useSearchParams needs the Suspense). */
export default function ContextPage() {
  return (
    <Suspense fallback={<main className="flex-1" />}>
      <ContextScreen />
    </Suspense>
  );
}
