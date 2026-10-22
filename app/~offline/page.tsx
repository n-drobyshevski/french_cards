import type { Metadata } from "next";
import { OfflineRetry } from "@/components/pwa/OfflineRetry";
import { AppMark } from "@/components/ui/AppMark";
import { buttonClasses } from "@/components/ui/button-classes";
import { Icon } from "@/components/ui/Icons";
import { APP_NAME } from "@/lib/brand";

export const metadata: Metadata = {
  title: `Нет сети · ${APP_NAME}`,
  robots: { index: false },
};

// Precached by the service worker and shown when a page that was never opened is requested offline.
export default function OfflinePage() {
  return (
    <main className="mx-auto flex w-full max-w-[440px] flex-1 flex-col px-4 md:max-h-[720px] md:max-w-[560px] md:justify-center pt-[calc(16px+env(safe-area-inset-top))] pb-[calc(16px+env(safe-area-inset-bottom))]">
      <header className="flex h-11 shrink-0 items-center">
        <AppMark />
      </header>

      <section
        aria-labelledby="offline-title"
        className="mt-4 flex min-h-[320px] flex-1 flex-col overflow-hidden rounded-card border border-rule bg-surface"
      >
        <div className="flex h-[46px] shrink-0 items-center justify-between border-b-2 border-red px-5">
          <span className="meta">Нет сети</span>
        </div>
        <div className="flex min-h-0 flex-1 flex-col justify-center px-6 pb-6">
          <p lang="fr" className="m-0 font-serif text-[40px] leading-[1.1] font-medium tracking-[-0.015em] text-ink">
            hors ligne
          </p>
          <p lang="fr" className="abbr mt-2 mb-0 text-[15px] leading-5">
            loc. adj.
          </p>
          <h1 id="offline-title" className="mt-6 mb-0 text-[17px] leading-6 font-medium text-ink">
            Эта страница ещё не сохранена на устройстве
          </h1>
          <p className="mt-2 mb-0 text-[15px] leading-[22px] text-muted">
            Повторение и библиотека работают без интернета, если уже открывались на этом устройстве. Слова,
            добавленные без сети, синхронизируются позже.
          </p>
        </div>
        <div className="mx-5 flex h-12 shrink-0 items-center gap-2 border-t border-rule text-[12px] text-muted">
          <Icon name="cloud-off" size={14} />
          <span>Проверь подключение и попробуй ещё раз</span>
        </div>
      </section>

      <div className="mt-4 flex shrink-0 flex-col gap-2">
        <OfflineRetry>
          {/* A full navigation (not next/link), so the service worker can answer from its cache. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/" className={buttonClasses({ variant: "secondary", block: true })}>
            Открыть повторение
          </a>
        </OfflineRetry>
      </div>
    </main>
  );
}
