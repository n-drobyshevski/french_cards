"use client";

// Six single-digit boxes (3 + dash + 3) per mockups/Login.dc.html. Handles typing, backspace,
// arrow keys, pasting the whole code into any box and iOS one-time-code autofill (which puts
// the full code into the first box).
import { useRef, type ClipboardEvent, type KeyboardEvent } from "react";

export const OTP_LENGTH = 6;

interface OtpInputProps {
  /** One entry per box; "" for an empty box. */
  digits: string[];
  onChange: (digits: string[]) => void;
  /** Called once every box holds a digit. */
  onComplete?: (code: string) => void;
  disabled?: boolean;
  invalid?: boolean;
  idPrefix?: string;
  describedBy?: string;
}

const onlyDigits = (value: string) => value.replace(/\D/g, "");

export function OtpInput({ digits, onChange, onComplete, disabled, invalid, idPrefix = "otp", describedBy }: OtpInputProps) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const length = digits.length;

  const focusBox = (index: number) => {
    const box = refs.current[Math.max(0, Math.min(length - 1, index))];
    box?.focus();
    box?.select();
  };

  const commit = (next: string[]) => {
    onChange(next);
    if (next.every((d) => d !== "")) onComplete?.(next.join(""));
  };

  /** Writes `incoming` digits starting at `start`, then moves focus after the last one. */
  const fill = (start: number, incoming: string) => {
    // A full-length code always starts at the first box, wherever it was pasted.
    const from = incoming.length >= length ? 0 : start;
    const next = [...digits];
    const chars = incoming.slice(0, length - from).split("");
    chars.forEach((ch, i) => (next[from + i] = ch));
    commit(next);
    focusBox(from + chars.length);
  };

  const handleChange = (index: number, raw: string) => {
    const value = onlyDigits(raw);
    if (value.length === 0) {
      const next = [...digits];
      next[index] = "";
      onChange(next);
      return;
    }
    if (value.length === 2 && digits[index] && value.includes(digits[index])) {
      // Typed into a filled box without selecting it: keep the new digit.
      const typed = value.replace(digits[index], "") || digits[index];
      fill(index, typed);
      return;
    }
    fill(index, value);
  };

  const handleKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      e.preventDefault();
      const next = [...digits];
      next[index - 1] = "";
      onChange(next);
      focusBox(index - 1);
    } else if (e.key === "ArrowLeft" && index > 0) {
      e.preventDefault();
      focusBox(index - 1);
    } else if (e.key === "ArrowRight" && index < length - 1) {
      e.preventDefault();
      focusBox(index + 1);
    }
  };

  const handlePaste = (index: number, e: ClipboardEvent<HTMLInputElement>) => {
    const pasted = onlyDigits(e.clipboardData.getData("text"));
    e.preventDefault();
    if (pasted) fill(index, pasted);
  };

  const half = Math.ceil(length / 2);

  return (
    <div role="group" aria-label={`Код из письма, ${length} цифр`} className="flex items-center gap-2">
      {digits.map((digit, i) => (
        <span key={i} className="contents">
          {i === half && <span aria-hidden="true" className="h-px w-2 shrink-0 bg-muted" />}
          <input
            ref={(el) => {
              refs.current[i] = el;
            }}
            id={`${idPrefix}-${i}`}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete={i === 0 ? "one-time-code" : "off"}
            enterKeyHint={i === length - 1 ? "done" : "next"}
            aria-label={`Цифра ${i + 1}`}
            aria-invalid={invalid || undefined}
            aria-describedby={describedBy}
            disabled={disabled}
            value={digit}
            onChange={(e) => handleChange(i, e.target.value)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            onPaste={(e) => handlePaste(i, e)}
            onFocus={(e) => e.target.select()}
            className={`h-14 w-11 min-w-0 shrink rounded-[4px] border bg-surface p-0 text-center font-mono text-2xl font-medium text-ink caret-ink outline-none transition-colors focus:border-ink focus:shadow-[inset_0_0_0_1px_var(--ink)] focus-visible:outline-none disabled:opacity-60 ${
              invalid ? "border-again" : "border-rule"
            }`}
          />
        </span>
      ))}
    </div>
  );
}
