import { describe, expect, it } from "vitest";
import { canonicalRedirect, isBackgroundRequest, strayAuthCodeRedirect } from "./proxy-redirects";

const req = (url: string, host = new URL(url).host) => ({ nextUrl: new URL(url), headers: new Headers({ host }) });
const prod = { VERCEL_ENV: "production", VERCEL_PROJECT_PRODUCTION_URL: "frenchcards.vercel.app" };

describe("canonicalRedirect", () => {
  it("sends production aliases to the production domain, keeping path and query", () => {
    const to = canonicalRedirect(req("https://frenchcards-ndrobyshevskis-projects.vercel.app/login?link=expired"), prod);
    expect(to?.toString()).toBe("https://frenchcards.vercel.app/login?link=expired");
  });

  it("leaves the production domain, previews and local runs alone", () => {
    expect(canonicalRedirect(req("https://frenchcards.vercel.app/"), prod)).toBeNull();
    expect(canonicalRedirect(req("https://frenchcards-git-x.vercel.app/"), { ...prod, VERCEL_ENV: "preview" })).toBeNull();
    expect(canonicalRedirect(req("http://localhost:3000/"), {})).toBeNull();
  });
});

describe("strayAuthCodeRedirect", () => {
  it("forwards a ?code= on an app page to /auth/confirm", () => {
    const to = strayAuthCodeRedirect(req("https://frenchcards.vercel.app/?code=abc&utm=x"));
    expect(to?.pathname).toBe("/auth/confirm");
    expect(to?.searchParams.get("code")).toBe("abc");
    expect(to?.searchParams.get("utm")).toBeNull();
  });

  it("ignores /auth/*, /api/* and pages without a code", () => {
    expect(strayAuthCodeRedirect(req("https://frenchcards.vercel.app/auth/confirm?code=abc"))).toBeNull();
    expect(strayAuthCodeRedirect(req("https://frenchcards.vercel.app/api/ai/suggest?code=abc"))).toBeNull();
    expect(strayAuthCodeRedirect(req("https://frenchcards.vercel.app/library"))).toBeNull();
  });
});

describe("isBackgroundRequest", () => {
  const headers = (init: Record<string, string>) => ({ headers: new Headers(init) });

  it("keeps document navigations, and requests without Sec-Fetch-Dest, as documents", () => {
    expect(isBackgroundRequest(headers({ "sec-fetch-dest": "document", "sec-fetch-mode": "navigate" }))).toBe(false);
    expect(isBackgroundRequest(headers({}))).toBe(false);
  });

  it("treats router payloads, prefetches and subresource fetches as background", () => {
    expect(isBackgroundRequest(headers({ "sec-fetch-dest": "empty" }))).toBe(true);
    expect(isBackgroundRequest(headers({ rsc: "1" }))).toBe(true);
    expect(isBackgroundRequest(headers({ "next-router-prefetch": "1" }))).toBe(true);
    expect(isBackgroundRequest(headers({ "sec-fetch-dest": "document", "sec-purpose": "prefetch;prerender" }))).toBe(true);
    expect(isBackgroundRequest(headers({ purpose: "prefetch" }))).toBe(true);
  });
});
