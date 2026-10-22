"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import { isSharedImport, takeSharedImages } from "@/components/pwa/share-target";

/**
 * Picks up screenshots shared to the installed app (Android share target). The service worker
 * stashes them and redirects to /import?shared=1; this takes them once and cleans the URL.
 * Must render inside <Suspense> (useSearchParams).
 */
export function SharedImages({ onFiles, onEmpty }: { onFiles: (files: File[]) => void; onEmpty?: () => void }) {
  const params = useSearchParams();
  const router = useRouter();
  const shared = isSharedImport(params);
  const taken = useRef(false);
  const handlers = useRef({ onFiles, onEmpty });

  useEffect(() => {
    handlers.current = { onFiles, onEmpty };
  });

  useEffect(() => {
    if (!shared || taken.current) return;
    // Taken once per mount (the ref also survives StrictMode's effect replay); clearing the
    // stash happens inside takeSharedImages, so a reload cannot import twice.
    taken.current = true;
    void takeSharedImages()
      .catch(() => [] as File[])
      .then((files) => {
        router.replace("/import");
        if (files.length > 0) handlers.current.onFiles(files);
        else handlers.current.onEmpty?.();
      });
  }, [shared, router]);

  return null;
}
