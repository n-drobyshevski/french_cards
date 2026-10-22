import { cx } from "./cx";

/** Outlined index card with the red header rule. md: 10×14 (app bar), lg: 20×28 (login). */
export function CardGlyph({ size = "md", className }: { size?: "md" | "lg"; className?: string }) {
  return size === "lg" ? (
    <svg aria-hidden="true" width="20" height="28" viewBox="0 0 20 28" fill="none" className={cx("shrink-0", className)}>
      <rect x="0.75" y="0.75" width="18.5" height="26.5" rx="1.5" stroke="var(--ink)" strokeWidth="1.5" />
      <path d="M0.75 7.5h18.5" stroke="var(--red)" strokeWidth="2" />
    </svg>
  ) : (
    <svg aria-hidden="true" width="10" height="14" viewBox="0 0 10 14" fill="none" className={cx("shrink-0", className)}>
      <rect x="0.5" y="0.5" width="9" height="13" rx="1" stroke="var(--ink)" strokeWidth="1" />
      <path d="M0.5 3.5h9" stroke="var(--red)" strokeWidth="1.5" />
    </svg>
  );
}

export interface AppMarkProps {
  /** md: Newsreader 22 (screen headers). lg: Newsreader 40 (login). */
  size?: "md" | "lg";
  /** Heading element for the login screen; a span otherwise. */
  as?: "span" | "h1";
  className?: string;
}

/** «Карточки» wordmark preceded by the card glyph. */
export function AppMark({ size = "md", as: Tag = "span", className }: AppMarkProps) {
  const lg = size === "lg";
  return (
    <Tag
      className={cx(
        "m-0 inline-flex items-center font-serif font-medium text-ink",
        lg ? "gap-3 text-[40px] leading-[44px] tracking-[-0.015em]" : "gap-2 text-[22px] leading-7 tracking-[-0.01em]",
        className,
      )}
    >
      <CardGlyph size={size} />
      <span>Карточки</span>
    </Tag>
  );
}
