// Pre-paint script for the root layout (kept free of React so a server component can import it).

export const FIRST_RUN_KEY = "kartochki:first-run";
/** Sessions or opens a hint stays visible for. */
export const FIRST_RUN_LIMIT = 3;

/**
 * Runs in <head> before first paint, like SIDEBAR_INIT_SCRIPT: lists the hints this device is past
 * (count at FIRST_RUN_LIMIT or more) in <html data-first-run-done="swipe-legend …">. A hint whose space
 * is laid out before hydration (`useFirstRunHint().pending`) is hidden by CSS from it, so the users
 * past their first sessions never see the space close, and new users never see it open (no CLS).
 */
export const FIRST_RUN_INIT_SCRIPT = `(function(){try{var c=JSON.parse(localStorage.getItem(${JSON.stringify(FIRST_RUN_KEY)})||"{}"),d=[];for(var k in c)if(c[k]>=${FIRST_RUN_LIMIT})d.push(k);if(d.length)document.documentElement.setAttribute("data-first-run-done",d.join(" "))}catch(e){}})()`;
