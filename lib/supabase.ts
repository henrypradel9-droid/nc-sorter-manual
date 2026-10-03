import type { Database } from "@/types/database";
import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
export function configured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}
export async function database() {
  if (!configured()) throw new Error("DATABASE_NOT_CONFIGURED");
  const jar = await cookies();
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => jar.getAll(),
        setAll: (values) => {
          try {
            for (const { name, value, options } of values)
              jar.set(name, value, options);
          } catch {
            /* Server component cookies are refreshed by proxy. */
          }
        },
      },
    },
  );
}
export function adminDatabase() {
  if (!process.env.SUPABASE_SECRET_KEY) throw new Error("ADMIN_NOT_CONFIGURED");
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
