import "server-only";
import { cache } from "react";
import { database } from "./supabase";
import type { Profile, Role } from "./domain";
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
const authorizedSession = cache(async () => {
  const db = await database();
  const {
    data: { user },
    error,
  } = await db.auth.getUser();
  if (error || !user)
    throw new HttpError(401, "Entre na sua conta para continuar.");
  const { data, error: profileError } = await db
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();
  const profile = data as Profile | null;
  if (profileError || !profile?.active)
    throw new HttpError(403, "Seu acesso ainda não foi aprovado ou está inativo. Consulte um administrador.");
  return { db, profile };
});
export async function authorize(allowed?: Role[]) {
  const session = await authorizedSession();
  if (allowed && !allowed.includes(session.profile.role))
    throw new HttpError(403, "Seu perfil não tem permissão para esta ação.");
  return session;
}
export function checkOrigin(request: Request) {
  if (!["GET", "HEAD"].includes(request.method)) {
    const origin = request.headers.get("origin");
    const expected = process.env.APP_ORIGIN;
    if (!origin || !expected || origin !== new URL(expected).origin)
      throw new HttpError(403, "Origem da solicitação inválida.");
  }
}
