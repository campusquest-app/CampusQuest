import { createClient } from "@supabase/supabase-js";
import {
  markPasswordResetPendingIfNeeded,
  supabaseAuthOptionsForPath,
} from "@/lib/client/passwordResetFlow";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing Supabase client environment variables. Check NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
  );
}

const authPath = typeof window === "undefined" ? "" : window.location.pathname;
const authSearch = typeof window === "undefined" ? "" : window.location.search;
const authHash = typeof window === "undefined" ? "" : window.location.hash;
markPasswordResetPendingIfNeeded(authPath, authSearch, authHash);
const authOptions = supabaseAuthOptionsForPath(authPath, authSearch, authHash);

export const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: authOptions,
});

if (process.env.NODE_ENV !== "production") {
  console.info("[cq:auth] supabase client ready", {
    supabaseUrl,
    hasAnonKey: Boolean(supabaseAnonKey),
  });
}

