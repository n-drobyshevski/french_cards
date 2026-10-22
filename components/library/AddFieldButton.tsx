"use client";

// «+ Поле» (the word card and the add form): with other kinds to offer (origin, a verb's
// conjugation) it opens the menu «Какое поле» with them and «Своё поле»; otherwise it adds a
// one-off field straight away.
import { useState } from "react";
import { Icon } from "@/components/ui/Icons";
import { Menu, MenuItem } from "./Menu";

/** A field the word card can add besides a one-off «своё поле»: shown in the «+ Поле» menu. */
export interface FieldKind {
  label: string;
  caption: string;
  onSelect: () => void;
}

/**
 * «+ Поле». With other kinds to offer (origin, a verb's conjugation) it opens a menu of them and
 * «Своё поле»; otherwise it adds a one-off field straight away (`onCustom`, null at the 12-field cap).
 */
export function AddFieldButton({ onClick, onCustom, extras = [] }: { onClick?: () => void; onCustom?: (() => void) | null; extras?: readonly FieldKind[] }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const custom = onCustom === undefined ? onClick : (onCustom ?? undefined);
  const menu = extras.length > 0;
  return (
    <>
      <button
        type="button"
        aria-haspopup={menu ? "menu" : undefined}
        aria-expanded={menu ? !!anchor : undefined}
        onClick={(e) => (menu ? setAnchor(anchor ? null : e.currentTarget) : custom?.())}
        className="relative mt-1 inline-flex h-9 items-center gap-1.5 self-start bg-transparent text-[13px] leading-5 font-medium text-ink before:absolute before:-inset-y-1 before:inset-x-0"
      >
        <Icon name="plus" size={14} strokeWidth={1.75} />
        Поле
      </button>
      {menu && (
        <Menu open={!!anchor} anchor={anchor ? { element: anchor } : null} onClose={() => setAnchor(null)} label="Какое поле" width={240}>
          {extras.map((k) => (
            <MenuItem key={k.label} caption={k.caption} onSelect={k.onSelect}>
              {k.label}
            </MenuItem>
          ))}
          <MenuItem caption={custom ? "название и значение" : "не больше 12 полей"} disabled={!custom} onSelect={() => custom?.()}>
            Своё поле
          </MenuItem>
        </Menu>
      )}
    </>
  );
}

