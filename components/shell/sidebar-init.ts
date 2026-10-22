// Pre-paint script for the root layout (kept free of React so a server component can import it).

export const SIDEBAR_STORAGE_KEY = "kartochki:sidebar";

/** Runs in <head> before first paint, like THEME_INIT_SCRIPT: re-applies <html data-sidebar="hidden">. */
export const SIDEBAR_INIT_SCRIPT = `(function(){try{if(localStorage.getItem(${JSON.stringify(SIDEBAR_STORAGE_KEY)})==="hidden")document.documentElement.setAttribute("data-sidebar","hidden")}catch(e){}})()`;
