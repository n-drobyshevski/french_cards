// Shared frame of the sign-in screens. Phones (< 768): mockups/Login.dc.html, the panel with the
// primary button and links under it. From 768 up: board 21 D-Login, a centred 400px column with
// the mark at y 120 and one index-card panel holding the fields, the primary and the links.
import { APP_NAME } from "@/lib/brand";

/** The page: phone column, or the centred 400px desktop column. */
export const AUTH_MAIN =
  "flex min-h-dvh flex-col bg-paper px-4 pt-28 pb-[max(28px,env(safe-area-inset-bottom))] text-ink md:mx-auto md:w-full md:max-w-[432px] md:pt-[120px] md:pb-10";

/** Wraps the panel and its actions: transparent on phones, the white index card from 768 up. */
export const AUTH_CARD =
  "contents md:mt-[68px] md:block md:overflow-hidden md:rounded-[6px] md:border md:border-rule md:bg-surface";

/** The panel section: the card on phones, flat inside AUTH_CARD from 768 up. */
export const AUTH_PANEL =
  "mt-12 overflow-hidden rounded-[6px] border border-rule bg-surface md:mt-0 md:rounded-none md:border-0";

/** «ВХОД» header with the red rule. */
export const AUTH_PANEL_HEAD =
  "flex h-[46px] items-center border-b-2 border-red px-4 font-mono text-[11px] leading-4 tracking-[.06em] text-muted md:h-10 md:px-6";

/** Panel body with the fields. */
export const AUTH_PANEL_BODY = "flex flex-col gap-4 px-4 pt-6 pb-5 md:px-6 md:pb-0";

/** A paragraph as the whole panel body («ВХОД НЕ НУЖЕН», «Проверяем ссылку…»). */
export const AUTH_PANEL_TEXT = "m-0 px-4 py-6 text-[15px] leading-[22px] md:px-6 md:pb-0";

/** Field label (PasswordField matches). */
export const AUTH_LABEL = "block text-[13px] leading-[18px] text-muted md:text-[12px] md:leading-4 md:font-medium";

/** Primary action: under the panel on phones, inside it (20px under the fields) from 768 up. Add
 * `md:mb-6` when nothing follows it in the panel. */
export const AUTH_PRIMARY =
  "mt-4 flex h-[52px] w-full shrink-0 cursor-pointer items-center justify-center rounded-[6px] bg-ink text-[15px] font-medium tracking-[.01em] text-on-ink disabled:cursor-default disabled:opacity-40 md:mx-6 md:mt-5 md:h-11 md:w-[calc(100%-48px)] md:text-[14px] md:tracking-normal";

/** AUTH_PRIMARY's placement for a <Button> (it brings the ink look, pending label and width lock). */
export const AUTH_PRIMARY_BUTTON =
  "mt-4 cursor-pointer tracking-[.01em] md:mx-6 md:mt-5 md:flex md:h-11 md:w-[calc(100%-48px)] md:text-[14px] md:tracking-normal";

/** «Забыли пароль?» / «Создать аккаунт» row; in the panel from 768 up, 32px tertiary buttons. */
export const AUTH_LINKS = "mt-2 flex items-center justify-between gap-3 md:mx-4 md:mt-2 md:mb-6 md:h-8";

/** Footnote: at the bottom on phones, 16px under the panel from 768 up. */
export const AUTH_FOOTNOTE = "mt-auto max-w-[300px] pt-8 text-xs leading-4 text-muted md:mt-4 md:max-w-none md:pt-0";

export function CardGlyph() {
  return (
    <svg
      aria-hidden="true"
      width="20"
      height="28"
      viewBox="0 0 20 28"
      fill="none"
      className="mt-2 shrink-0 md:relative md:-top-1 md:mt-0 md:h-5 md:w-[14px]"
    >
      <rect x="0.75" y="0.75" width="18.5" height="26.5" rx="1.5" className="stroke-ink" strokeWidth="1.5" />
      <path d="M0.75 7.5h18.5" className="stroke-red" strokeWidth="2" />
    </svg>
  );
}

/** Card glyph + «Карточки для Лизи» (Newsreader 40/44). */
export function AuthMark() {
  return (
    <div className="flex items-start gap-3 md:h-11 md:items-center">
      <CardGlyph />
      <h1 className="m-0 font-serif text-[40px] leading-[44px] font-medium tracking-[-0.015em] text-balance md:tracking-[-0.02em] md:whitespace-nowrap">
        {APP_NAME}
      </h1>
    </div>
  );
}
