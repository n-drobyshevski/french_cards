// Pre-paint login gate for the app shell (MOTION-SPEC U3). Kept free of React so the (app) layout,
// a server component, can inline it. Only rendered when Supabase is configured.

/** localStorage key that remembers this device had a valid session (components/auth/session.ts). */
export const AUTH_MARKER_KEY = "kartochki.auth.email";

/**
 * Runs before the app paints: with no Supabase session cookie and no signed-in marker there is
 * nothing AuthGate could let through, so go to /login at once (the app is never drawn). A device
 * with a cached session, valid or not, falls through to AuthGate, which checks it.
 */
export const AUTH_INIT_SCRIPT = `(function(){try{if(/(?:^|;\\s*)sb-[^=]*-auth-token/.test(document.cookie))return;if(localStorage.getItem(${JSON.stringify(AUTH_MARKER_KEY)})!==null)return;document.documentElement.style.visibility="hidden";location.replace("/login")}catch(e){}})()`;
