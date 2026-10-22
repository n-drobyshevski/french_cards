"use client";

// «Заполнить автоматически» under the word card's «Происхождение» and «Спряжение» forms
// (lib/autofill.ts): fills the open form, the learner checks it and saves.
import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useRef, useState } from "react";
import { cx } from "@/components/ui/cx";
import { Icon } from "@/components/ui/Icons";
import { getSettings } from "@/lib/settings";

export function AutoFillButton<T>({
  fill,
  onFill,
  label = "Заполнить автоматически",
  className,
}: {
  fill: (opts: { signal: AbortSignal; model?: "fast" | "accurate" }) => Promise<T>;
  onFill: (value: T) => void;
  label?: string;
  className?: string;
}) {
  const settings = useLiveQuery(getSettings);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);

  const run = async () => {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setBusy(true);
    setError(null);
    try {
      const value = await fill({ signal: controller.signal, model: settings?.ai_model });
      if (!controller.signal.aborted) onFill(value);
    } catch (e) {
      if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Не получилось заполнить");
    } finally {
      if (abort.current === controller) {
        abort.current = null;
        setBusy(false);
      }
    }
  };

  return (
    <div className={cx("flex flex-col", className)} aria-busy={busy}>
      <button
        type="button"
        onClick={() => void run()}
        disabled={busy}
        className="relative inline-flex h-9 items-center gap-1.5 self-start bg-transparent text-[13px] leading-5 font-medium text-ink before:absolute before:-inset-y-1 before:inset-x-0 disabled:opacity-50"
      >
        <Icon name={busy ? "refresh" : "spark"} size={busy ? 14 : 16} strokeWidth={1.5} className={cx(busy && "animate-spin")} />
        {busy ? "Заполняем…" : label}
      </button>
      {error && (
        <p role="status" className="m-0 text-[12px] leading-4 text-muted">
          {error}
        </p>
      )}
    </div>
  );
}
