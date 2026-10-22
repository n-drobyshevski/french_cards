"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** A section counts as current once its top is this close to the top of the window. */
const SPY_OFFSET = 120;

/**
 * Which section is current: the last one whose top has scrolled to {@link SPY_OFFSET}, or the last
 * section once the page is scrolled to the bottom. Pure, for tests.
 */
export function currentSection(tops: readonly number[], atBottom: boolean, offset = SPY_OFFSET): number {
  if (!tops.length) return -1;
  if (atBottom) return tops.length - 1;
  let current = 0;
  tops.forEach((top, i) => {
    if (top <= offset) current = i;
  });
  return current;
}

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Scroll-spy for the settings section nav. `go(id)` scrolls to a section and keeps it current until
 * the user scrolls by hand (a short last section may never reach the top of the window).
 */
export function useSectionSpy(ids: readonly string[]) {
  const [active, setActive] = useState(ids[0]);
  const pinned = useRef<string | null>(null);
  const key = ids.join(" ");

  useEffect(() => {
    const list = key.split(" ");
    let frame = 0;
    const measure = () => {
      frame = 0;
      if (pinned.current) return;
      const tops = list.map((id) => document.getElementById(id)?.getBoundingClientRect().top ?? Infinity);
      const doc = document.documentElement;
      const atBottom = window.scrollY > 0 && window.scrollY + window.innerHeight >= doc.scrollHeight - 2;
      const i = currentSection(tops, atBottom);
      if (i >= 0) setActive(list[i]);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    const release = () => {
      pinned.current = null;
    };

    // Opened as /settings#set-keys (e.g. from «Клавиши»): the section mounts after hydration.
    const hash = decodeURIComponent(window.location.hash.slice(1));
    if (list.includes(hash)) {
      pinned.current = hash;
      setActive(hash);
      document.getElementById(hash)?.scrollIntoView({ block: "start" });
    } else {
      onScroll();
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    // Hand scrolling ends a pin set by a nav click.
    window.addEventListener("wheel", release, { passive: true });
    window.addEventListener("touchstart", release, { passive: true });
    window.addEventListener("keydown", release, true);
    window.addEventListener("pointerdown", release, true);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      window.removeEventListener("wheel", release);
      window.removeEventListener("touchstart", release);
      window.removeEventListener("keydown", release, true);
      window.removeEventListener("pointerdown", release, true);
    };
  }, [key]);

  const go = useCallback((id: string) => {
    const section = document.getElementById(id);
    if (!section) return;
    pinned.current = id;
    setActive(id);
    section.scrollIntoView({ block: "start", behavior: reducedMotion() ? "auto" : "smooth" });
    section.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true });
    window.history.replaceState(window.history.state, "", `#${id}`);
  }, []);

  return { active, go };
}
