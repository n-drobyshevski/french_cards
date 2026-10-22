"use client";

import { useState } from "react";
import { useBootFailure } from "@/components/providers/AppProviders";
import { Button } from "@/components/ui/Button";

/**
 * First-run setup failed (MOTION-SPEC B1, §3.8): in place of the theme tiles, one line on a 1px
 * --again rule with «Повторить» on the right. Null while setup is fine.
 */
export function BootNotice() {
  const { failed, retry } = useBootFailure();
  const [retrying, setRetrying] = useState(false);
  if (!failed) return null;
  return (
    <div role="alert" className="mt-3 flex min-h-14 items-center justify-between gap-3 border-t border-again">
      <p className="m-0 min-w-0 text-[13px] leading-5 text-ink">Не удалось подготовить базу</p>
      <Button
        variant="tertiary"
        size="sm"
        className="-mr-2.5 shrink-0"
        pending={retrying}
        pendingLabel="Повторяем…"
        pendingDelay={0}
        onClick={() => {
          setRetrying(true);
          void retry().finally(() => setRetrying(false));
        }}
      >
        Повторить
      </Button>
    </div>
  );
}
