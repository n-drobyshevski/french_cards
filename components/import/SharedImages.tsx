"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import { isSharedImport, takeSharedImages } from "@/components/pwa/share-target";
import { takeHandedOffImages } from "./clipboard";

/**
 * Picks up screenshots shared to the installed app (Android share target). The service worker
 * stashes them and redirects to /import?shared=1; this takes them once and cleans the URL.
 * Files dropped or pasted elsewhere in the app on desktop (GlobalImportDrop) arrive on the same
 * URL through the in-memory hand-over, which is checked first.
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
    // The import page stays mounted (hidden) across navigations; arm again for the next share.
    if (!shared) {
      taken.current = false;
      return;
    }
    if (taken.current) return;
    // Taken once per mount (the ref also survives StrictMode's effect replay); clearing the
    // stash happens inside takeSharedImages, so a reload cannot import twice.
    taken.current = true;
    const handed = takeHandedOffImages();
    void (handed.length > 0 ? Promise.resolve(handed) : takeSharedImages())
      .catch(() => [] as File[])
      .then((files) => {
        router.replace("/import");
        if (files.length > 0) handlers.current.onFiles(files);
        else handlers.current.onEmpty?.();
      });
  }, [shared, router]);

  return null;
}
