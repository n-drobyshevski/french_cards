"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { readReviewFilter, writeReviewFilter } from "./filter";

/**
 * Applies `/?folder=<id|inbox|all>` (the folder screen's «Повторить тему») to the remembered
 * review filter, then drops the parameter from the URL. Render inside <Suspense>.
 */
export function ReviewFolderParam() {
  const params = useSearchParams();
  const router = useRouter();
  const folder = params.get("folder");

  useEffect(() => {
    if (!folder) return;
    const current = readReviewFilter();
    if (current.folder !== folder) writeReviewFilter({ ...current, folder });
    router.replace("/", { scroll: false });
  }, [folder, router]);

  return null;
}
