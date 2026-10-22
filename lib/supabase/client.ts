// Browser Supabase client. Null in local-only mode and during server rendering.
import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseConfig } from "./config";

let client: SupabaseClient | null = null;

export function getSupabaseBrowserClient(): SupabaseClient | null {
  if (client) return client;
  if (typeof window === "undefined") return null;
  const config = getSupabaseConfig();
  if (!config) return null;
  client = createBrowserClient(config.url, config.key);
  return client;
}

export { isSupabaseConfigured } from "./config";
