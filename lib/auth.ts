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
  const [profileResult, stateResult] = await Promise.all([db
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single(), db.rpc("password_change_state")]);
  const profile = profileResult.data as Profile | null;
  if (profileResult.error || !profile?.active)
    throw new HttpError(403, "Seu acesso ainda não foi aprovado ou está inativo. Consulte um administrador.");
  if (stateResult.error) throw new HttpError(503, "Não foi possível verificar o acesso. Tente novamente.");
  const state = stateResult.data as { required: boolean; session_valid: boolean };
  if (!state.session_valid) throw new HttpError(401, "Sua sessão ou senha temporária expirou. Entre novamente ou solicite outra senha a um administrador autorizado.");
  return { db, profile, mustChangePassword: state.required };
});
export async function authorize(allowed?: Role[], options?: { allowPasswordChange?: boolean }) {
  const session = await authorizedSession();
  if (session.mustChangePassword && !options?.allowPasswordChange)
    throw new HttpError(403, "Defina uma nova senha em Minha conta para continuar.");
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
