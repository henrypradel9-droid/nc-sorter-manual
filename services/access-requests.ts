import "server-only";
import { z } from "zod";
import { adminDatabase } from "@/lib/supabase";
import { authorize, HttpError } from "@/lib/auth";
import { accessRequestSchema, decisionSchema } from "@/schemas/access-request";

export async function submitAccessRequest(request: Request) {
  // Parse before any privileged call. Never log or persist the request password.
  const input = accessRequestSchema.parse(await request.json());
  const service = adminDatabase();
  const existing = await service.from("access_requests").select("id").eq("username", input.username).maybeSingle();
  if (existing.error) throw new HttpError(503, "Não foi possível receber a solicitação. Tente novamente.");
  if (existing.data) throw new HttpError(409, "Este usuário já possui cadastro ou solicitação.");
  const { error } = await service.auth.admin.createUser({
    email: input.email, password: input.password, email_confirm: true,
    user_metadata: { nc_access_request: true, name: input.name, username: input.username, requested_role: input.requested_role },
  });
  // Auth and the application row are created atomically by the INSERT trigger.
  if (error) {
    if (error.code === "email_exists" || error.code === "user_already_exists")
      throw new HttpError(409, "Este e-mail já possui cadastro ou solicitação.");
    throw new HttpError(400, "Não foi possível solicitar acesso. Verifique se o e-mail ou usuário já está cadastrado e tente novamente.");
  }
  return { success: true };
}

export async function manageAccessRequests(request: Request, id?: string) {
  const { db } = await authorize(["ADMIN"]);
  if (request.method === "POST" && id) {
    const input = decisionSchema.parse(await request.json());
    const { data, error } = await db.rpc("decide_access_request", {
      request_id: z.string().uuid().parse(id), decision: input.decision,
      ...(input.decision === "APROVADO" ? { approved_role: input.approved_role } : { reason: input.reason }),
    });
    if (error?.message.includes("REQUEST_ALREADY_DECIDED")) throw new HttpError(409, "Esta solicitação já foi analisada. Atualize a lista.");
    if (error) throw new HttpError(400, "Não foi possível concluir a análise.");
    return data;
  }
  if (request.method !== "GET") throw new HttpError(405, "Método não permitido.");
  if (id) {
    const { data, error } = await db.from("access_requests").select("*").eq("id", z.string().uuid().parse(id)).single();
    if (error) throw new HttpError(404, "Solicitação não encontrada.");
    return data;
  }
  const p = new URL(request.url).searchParams;
  const page = z.coerce.number().int().min(1).max(100000).parse(p.get("page") || 1);
  let query = db.from("access_requests").select("*", { count: "exact" }).order("created_at", { ascending: false }).order("id", { ascending: false });
  if (p.get("status")) query = query.eq("status", z.enum(["PENDENTE", "APROVADO", "RECUSADO"]).parse(p.get("status")));
  if (p.get("role")) query = query.eq("requested_role", z.enum(["OPERADOR", "LIDER"]).parse(p.get("role")));
  const from = p.get("from"), to = p.get("to");
  if (from && to && from > to) throw new HttpError(400, "Período inválido.");
  if (from) query = query.gte("created_at", z.string().date().parse(from) + "T00:00:00-03:00");
  if (to) query = query.lte("created_at", z.string().date().parse(to) + "T23:59:59.999-03:00");
  const term = z.string().max(100).parse(p.get("q") || "").replace(/[^\p{L}\p{N}@._ -]/gu, "").trim();
  if (term) query = query.or(`name.ilike.%${term}%,email.ilike.%${term}%,username.ilike.%${term}%`);
  const { data, count, error } = await query.range((page - 1) * 25, page * 25 - 1);
  if (error) throw new HttpError(400, "Não foi possível carregar as solicitações.");
  return { data, count };
}
