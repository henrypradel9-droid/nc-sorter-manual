import { NextResponse } from "next/server";
import { database } from "@/lib/supabase";
import type { EmailOtpType } from "@supabase/supabase-js";
export async function GET(request: Request) {
  const url = new URL(request.url);
  const token_hash = url.searchParams.get("token_hash"),
    type = url.searchParams.get("type"),
    code = url.searchParams.get("code");
  const db = await database();
  if (token_hash && ["invite", "recovery", "email"].includes(type ?? "")) {
    const { error } = await db.auth.verifyOtp({
      token_hash,
      type: type as EmailOtpType,
    });
    if (!error)
      return NextResponse.redirect(new URL("/conta", process.env.APP_ORIGIN));
  }
  if (code) {
    const { error } = await db.auth.exchangeCodeForSession(code);
    if (!error)
      return NextResponse.redirect(new URL("/conta", process.env.APP_ORIGIN));
  }
  return NextResponse.redirect(
    new URL("/login?error=link", process.env.APP_ORIGIN),
  );
}
