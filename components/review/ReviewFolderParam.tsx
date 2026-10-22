"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { readReviewFilter, writeReviewFilter } from "./filter";
import { requestThemePractice } from "./practice-request";

/**
 * Applies `/?folder=<id|inbox|all>` (the folder screen's «Повторить тему») to the remembered
 * review filter, then drops the parameter from the URL. With `&practice=1` («Тренировка всей
 * темы») it also asks the review screen for a practice round over that theme. Render inside <Suspense>.
 */
export function ReviewFolderParam() {
  const params = useSearchParams();
  const router = useRouter();
  const folder = params.get("folder");
  const practice = params.get("practice") === "1";

  useEffect(() => {
    if (!folder) return;
    const current = readReviewFilter();
    if (current.folder !== folder) writeReviewFilter({ ...current, folder });
    if (practice && folder !== "all") requestThemePractice(folder);
    router.replace("/", { scroll: false });
  }, [folder, practice, router]);

  return null;
}
