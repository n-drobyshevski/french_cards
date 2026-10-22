"use client";

import { Button } from "@/components/ui/Button";

/** «Повторить» on the offline page: reloads, which goes back through the service worker. */
export function OfflineRetry() {
  return (
    <Button block onClick={() => window.location.reload()}>
      Повторить
    </Button>
  );
}
