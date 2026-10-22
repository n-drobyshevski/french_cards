"use client";

import { useState } from "react";

interface Props {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: "current-password" | "new-password";
  enterKeyHint?: "next" | "go" | "done";
  disabled?: boolean;
  describedBy?: string;
}

/** Password input with a show/hide toggle; 17px text so iOS does not zoom on focus. */
export function PasswordField({ id, label, value, onChange, autoComplete, enterKeyHint, disabled, describedBy }: Props) {
  const [visible, setVisible] = useState(false);
  return (
    <div>
      <label htmlFor={id} className="block text-[13px] leading-[18px] text-muted">
        {label}
      </label>
      <div className="mt-2 flex h-12 items-center rounded-[4px] border border-rule bg-surface focus-within:border-ink focus-within:shadow-[inset_0_0_0_1px_var(--ink)]">
        <input
          id={id}
          name={id}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint={enterKeyHint}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          aria-describedby={describedBy}
          className="h-full min-w-0 flex-1 bg-transparent px-3 text-[17px] text-ink caret-ink outline-none focus-visible:outline-none disabled:opacity-60"
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Скрыть пароль" : "Показать пароль"}
          aria-pressed={visible}
          className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center text-muted"
        >
          <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
            <circle cx="12" cy="12" r="3" />
            {visible && <path d="M3 3l18 18" />}
          </svg>
        </button>
      </div>
    </div>
  );
}
