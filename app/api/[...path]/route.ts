import { NextResponse } from "next/server";
import { submitAccessRequest, manageAccessRequests } from "@/services/access-requests";
import { ZodError, z } from "zod";
import { passwordLengthSchema } from "@/schemas/password";
import { authorize, checkOrigin, HttpError } from "@/lib/auth";
import { adminDatabase, database } from "@/lib/supabase";
import { csvCell, type Occurrence } from "@/lib/domain";
import {
  occurrenceSchema,
  catalogSchema,
  profileSchema,
  inviteSchema,
  settingsSchema,
  followUpSchema,
} from "@/schemas";
import {
  filtersFrom,
  occurrenceQuery,
  occurrenceSelect,
} from "@/services/occurrences";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ path: string[] }> };
function ok(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}
function check(error: { code?: string; message?: string } | null) {
  if (!error) return;
  if (error.code === "23505")
    throw new HttpError(
      409,
      "Este registro já existe. Verifique também os itens desativados.",
    );
  if (error.code === "42501")
    throw new HttpError(403, "Você não tem permissão para esta ação.");
  console.error("Database operation failed", { code: error.code });
  throw new HttpError(
    400,
    "Não foi possível salvar. Verifique os campos e se os cadastros estão ativos.",
  );
}
async function handle(request: Request, context: Context) {
  try {
    checkOrigin(request);
    const { path } = await context.params;
    const [resource, id, action] = path;
    const method = request.method;
    const url = new URL(request.url);
    if (resource === "access-requests") {
      if (method === "POST" && !id) return ok(await submitAccessRequest(request), 201);
      return ok(await manageAccessRequests(request, id));
    }
    if (resource === "auth") {
      if (method !== "POST") throw new HttpError(405, "Método não permitido.");
      const db = await database();
      if (id === "logout") {
        const { error } = await db.auth.signOut();
        check(error);
        return ok({ success: true });
      }
      if (id === "login") {
        const input = z
          .object({
            email: z.string().email(),
            password: z.string().min(1).max(256),
          })
          .parse(await request.json());
        const { error } = await db.auth.signInWithPassword(input);
        if (error) {
          if (error.name === "AuthRetryableFetchError" || error.status === 0 || (error.status && error.status >= 500))
            throw new HttpError(503, "Não foi possível conectar ao serviço de acesso. Tente novamente em instantes.");
          if (error.status === 429) throw new HttpError(429, "Muitas tentativas de acesso. Aguarde alguns minutos.");
          throw new HttpError(401, "E-mail ou senha inválidos.");
        }
        try {
          await authorize();
        } catch (e) {
          await db.auth.signOut();
          throw e;
        }
        return ok({ success: true });
      }
      if (id === "password") {
        await authorize();
        const { password } = z
          .object({ password: passwordLengthSchema })
          .parse(await request.json());
        const { error } = await db.auth.updateUser({ password });
        check(error);
        return ok({ success: true });
      }
      throw new HttpError(404, "Ação não encontrada.");
    }
    const { db, profile } = await authorize();
    const leader = () => {
      if (profile.role !== "ADMIN")
        throw new HttpError(403, "Acesso reservado à liderança.");
    };
    const admin = () => {
      if (profile.role !== "ADMIN")
        throw new HttpError(403, "Acesso reservado à administração.");
    };
    if (profile.role !== "ADMIN" && !(
      (resource === "occurrences" && (method === "GET" || (method === "POST" && !id))) ||
      (resource === "alerts" && method === "GET" && !id) ||
      (["lookups", "suggestions", "me"].includes(resource) && method === "GET" && !id)
    )) throw new HttpError(403, "Acesso reservado à administração.");
    if (resource === "me" && method === "GET") return ok(profile);
    if (resource === "navigation-counts" && method === "GET") {
      leader();
      const [alerts, requests] = await Promise.all([
        db.from("alerts").select("id", { count: "exact", head: true }).eq("active", true).in("status", ["NOVO", "VISUALIZADO"]),
        profile.role === "ADMIN"
          ? db.from("access_requests").select("id", { count: "exact", head: true }).eq("status", "PENDENTE")
          : Promise.resolve({ count: 0, error: null }),
      ]);
      check(alerts.error);
      check(requests.error);
      return ok({ alerts: alerts.count ?? 0, requests: requests.count ?? 0 });
    }
    if (resource === "lookups" && method === "GET") {
      const results = await Promise.all(
        (["error_types", "shifts"] as const).map((table) =>
          profile.role === "ADMIN" ? db.from(table).select("*").order("name") : db.from(table).select("*").eq("active",true).order("name"),
        ),
      );
      results.forEach((r) => check(r.error));
      const people = profile.role === "ADMIN" ? await db
        .from("profiles")
        .select("id,name")
        .order("name") : {data:[],error:null};
      check(people.error);
      return ok({
        error_types: results[0].data,
        shifts: results[1].data,
        canalizacoes: [],
        profiles: people.data,
      });
    }
    if (resource === "suggestions" && method === "GET") {
      if (profile.role !== "ADMIN") return ok([]);
      const prefix = z
        .string()
        .max(100)
        .parse(url.searchParams.get("q") ?? "");
      const { data, error } = await db.rpc("suggest_users", { prefix });
      check(error);
      return ok(data);
    }
    if (resource === "occurrences") {
      if (id) z.string().uuid().parse(id);
      if (method === "GET" && id) {
        const { data, error } = await db
          .from("occurrences")
          .select(occurrenceSelect)
          .eq("id", id)
          .single();
        if (error) throw new HttpError(404, "Ocorrência não encontrada.");
        const history = profile.role === "ADMIN" ? await db
          .from("audit_logs")
          .select("*")
          .eq("entity", "occurrences")
          .eq("record_id", id)
          .order("created_at", { ascending: false })
          .limit(100) : {data:[],error:null};
        check(history.error);
        const pastAlerts = await db.from("alerts").select("id", {count:"exact",head:true}).eq("occurrence_user", data.occurrence_user_normalized ?? data.occurrence_user.trim().toLowerCase()).or("status.eq.ACOMPANHAMENTO_REALIZADO,active.eq.false");
        check(pastAlerts.error);
        return ok({ occurrence: data, history: history.data, alert_count: pastAlerts.count ?? 0 });
      }
      if (method === "GET") {
        const filters = filtersFrom(url);
        const start = (filters.page - 1) * filters.page_size;
        const { data, count, error } = await occurrenceQuery(db, filters).range(
          start,
          start + filters.page_size - 1,
        );
        check(error);
        return ok({ data, count });
      }
      if (method === "POST" || method === "PATCH") {
        const input = occurrenceSchema.parse(await request.json());
        const { version, ...payload } = input;
        if (method === "PATCH") {
          leader();
          if (id !== input.id || !version)
            throw new HttpError(400, "Versão do registro inválida.");
          const { id: recordId, ...changes } = payload;
          const { data, error } = await db
            .from("occurrences")
            .update(changes)
            .eq("id", recordId)
            .eq("version", version)
            .select("id")
            .maybeSingle();
          check(error);
          if (!data)
            throw new HttpError(
              409,
              "Esta ocorrência foi alterada por outra pessoa. Reabra os detalhes antes de salvar.",
            );
          return ok(data);
        }
        const { error } = await db.from("occurrences").insert(payload);
        if (error?.code === "23505") {
          const existing = await db.rpc("occurrence_receipt", {record_id: input.id});
          if (existing.data === true)
            return ok({ id: input.id, replayed: true });
        }
        check(error);
        return ok({id:input.id}, 201);
      }
    }
    if (resource === "dashboard-v2" && method === "GET") {
      leader();
      const { data, error } = await db.rpc("dashboard_v2", {
        filters: filtersFrom(url),
        bucket_by: z.enum(["day", "week", "month"]).parse(url.searchParams.get("grouping") || "day"),
      });
      if (error?.message.includes("INVALID_DASHBOARD_PERIOD")) throw new HttpError(400, "Selecione um período de até 10 anos, com início anterior ao fim.");
      check(error);
      return ok(data);
    }
    if (resource === "dashboard" && method === "GET") {
      leader();
      const { data, error } = await db.rpc("dashboard", {
        filters: filtersFrom(url),
      });
      check(error);
      return ok(data);
    }
    if (resource === "export" && method === "GET") {
      leader();
      const filters = filtersFrom(url);
      const exported = await db.rpc("export_occurrences", { filters });
      if (exported.error?.message.includes("EXPORT_TOO_LARGE"))
        throw new HttpError(
          422,
          "A exportação excede 20.000 registros. Reduza o período ou aplique mais filtros.",
        );
      check(exported.error);
      const rows = exported.data as Occurrence[];
      const header = [
        "Data/hora",
        "Package ID",
        "HU",
        "Usuário",
        "Tipo de erro",
        "Turno",
        "Canalização",
        "Quantidade",
        "Status",
        "Registrado por",
        "TT",
        "Observações",
      ];
      const content = [
        header,
        ...rows.map((o) => [
          o.occurred_at,
          o.package_id,
          o.hu,
          o.occurrence_user,
          o.error_type?.name,
          o.shift?.name,
          o.canalizacao,
          o.package_quantity,
          o.status,
          o.registered_by?.name,
          o.tt,
          o.observations,
        ]),
      ]
        .map((row) => row.map(csvCell).join(";"))
        .join("\r\n");
      return new Response("\uFEFF" + content, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": 'attachment; filename="nc-sorter.csv"',
          "Cache-Control": "private, no-store",
        },
      });
    }
    if (resource === "catalogs") {
      leader();
      const table = z.enum(["error_types", "shifts"]).parse(id);
      if (method === "GET") {
        const { data, error } = await db.from(table).select("*").order("name");
        check(error);
        return ok(data);
      }
      if (method === "POST" || method === "PATCH") {
        const input = catalogSchema.parse(await request.json());
        const { id: recordId, ...payload } = input;
        if (table !== "shifts") {
          delete payload.start_time;
          delete payload.end_time;
        }
        const basic = { name: payload.name, active: payload.active, description: payload.description };
        const query = table === "shifts"
          ? method === "POST" ? db.from("shifts").insert(payload) : db.from("shifts").update(payload).eq("id", z.string().uuid().parse(recordId))
          : method === "POST" ? db.from(table).insert(basic) : db.from(table).update(basic).eq("id", z.string().uuid().parse(recordId));
        const { data, error } = await query.select("*").single();
        check(error);
        return ok(data);
      }
    }
    if (resource === "alerts") {
      if (method !== "GET" || id) leader();
      if (method === "GET" && id) {
        z.string().uuid().parse(id);
        const [alert, notes] = await Promise.all([
          db.from("alerts").select("*").eq("id", id).single(),
          db
            .from("alert_follow_ups")
            .select("*,responsible:profiles!responsible_user_id(name)")
            .eq("alert_id", id)
            .order("created_at", { ascending: false }),
        ]);
        check(alert.error);
        check(notes.error);
        return ok({ alert: alert.data, notes: notes.data });
      }
      if (method === "GET") {
        const alertParams = new URL(url);
        alertParams.searchParams.delete("status");
        const f = filtersFrom(alertParams);
        const history = url.searchParams.get("history") === "true";
        const responsible = profile.role === "ADMIN" ? url.searchParams.get("responsible") : null;
        const alertStatus = url.searchParams.get("status");
        let q = db
          .from("alerts")
          .select(profile.role !== "ADMIN" ? "*" : responsible ? "*,follow_ups:alert_follow_ups!inner(*,responsible:profiles!responsible_user_id(name))" : "*,follow_ups:alert_follow_ups(*,responsible:profiles!responsible_user_id(name))", { count: "exact" })
          .order("period_start", { ascending: false });
        if (!history) q = q.eq("active", true).in("status", ["NOVO", "VISUALIZADO"]);
        else q = q.or("status.eq.ACOMPANHAMENTO_REALIZADO,active.eq.false");
        if (f.occurrence_user) q = q.eq("occurrence_user", f.occurrence_user.trim().toLowerCase());
        if (responsible) q = q.eq("follow_ups.responsible_user_id", z.string().uuid().parse(responsible));
        if (alertStatus) q = q.eq("status", z.enum(["NOVO","VISUALIZADO","ACOMPANHAMENTO_REALIZADO"]).parse(alertStatus));
        if (f.from) q = q.gte("last_occurrence", f.from + "T00:00:00-03:00");
        if (f.to) q = q.lte("last_occurrence", f.to + "T23:59:59.999-03:00");
        const { data, error, count } = await q.range(
          (f.page - 1) * f.page_size,
          f.page * f.page_size - 1,
        );
        check(error);
        return ok({ data, count });
      }
      if (method === "POST" && action === "view") {
        z.string().uuid().parse(id);
        const { error } = await db
          .from("alerts")
          .update({ status: "VISUALIZADO" })
          .eq("id", id)
          .eq("status", "NOVO");
        check(error);
        return ok({ success: true });
      }
    }
    if (resource === "followups" && method === "POST") {
      leader();
      const input = followUpSchema.parse(await request.json());
      const { data, error } = await db
        .from("alert_follow_ups")
        .insert(input)
        .select("*")
        .single();
      check(error);
      return ok(data, 201);
    }
    if (resource === "settings") {
      admin();
      if (method === "GET") {
        const { data, error } = await db
          .from("system_settings")
          .select("*")
          .eq("id", true)
          .single();
        check(error);
        return ok(data);
      }
      if (method === "PATCH") {
        const input = settingsSchema.parse(await request.json());
        const { error } = await db
          .from("system_settings")
          .update(input)
          .eq("id", true);
        check(error);
        return ok({ success: true });
      }
    }
    if (resource === "users") {
      admin();
      const capabilities = await db.rpc("user_admin_capabilities");
      check(capabilities.error);
      const permissions = capabilities.data as { primary_admin_id: string; can_delete: boolean };
      if (method === "GET") {
        const page = z.coerce
          .number()
          .int()
          .min(1)
          .parse(url.searchParams.get("page") ?? 1);
        const { data, count, error } = await db
          .from("profiles")
          .select("*", { count: "exact" })
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
          .range((page - 1) * 25, page * 25 - 1);
        check(error);
        return ok({ data, count, ...permissions });
      }
      if (method === "DELETE") {
        if (!permissions.can_delete) throw new HttpError(403, "Somente o ADMIN primário pode excluir usuários.");
        const input = z.object({ id: z.string().uuid(), confirmation_email: z.string().trim().email().max(254) }).strict().parse(await request.json());
        if (input.id === permissions.primary_admin_id) throw new HttpError(409, "O ADMIN primário não pode ser excluído.");
        const deletion = await db.rpc("delete_user_access", { target_user_id: input.id, confirmation_email: input.confirmation_email });
        if (deletion.error?.code === "22023") throw new HttpError(400, "Digite o e-mail do usuário para confirmar a exclusão.");
        if (deletion.error?.code === "P0002") throw new HttpError(404, "Usuário não encontrado.");
        check(deletion.error);
        return ok({ success: true });
      }
      if (method === "PATCH") {
        const { id: recordId, ...payload } = profileSchema.parse(
          await request.json(),
        );
        if (recordId === permissions.primary_admin_id && (!payload.active || payload.role !== "ADMIN"))
          throw new HttpError(409, "O ADMIN primário deve permanecer ativo e com perfil ADMIN.");
        if (
          recordId === profile.id &&
          (!payload.active || payload.role !== "ADMIN")
        )
          throw new HttpError(
            409,
            "Você não pode remover seu próprio acesso administrativo.",
          );
        const { error } = await db
          .from("profiles")
          .update(payload)
          .eq("id", recordId);
        check(error);
        return ok({ success: true });
      }
      if (method === "POST") {
        const input = inviteSchema.parse(await request.json());
        const service = adminDatabase();
        const { data, error } = await service.auth.admin.inviteUserByEmail(
          input.email,
          { redirectTo: process.env.APP_ORIGIN + "/auth/confirm" },
        );
        check(error);
        if (!data.user)
          throw new HttpError(400, "Não foi possível criar o convite.");
        const created = await db
          .from("profiles")
          .insert({
            id: data.user.id,
            email: input.email,
            name: input.name,
            role: input.role,
            active: true,
          });
        check(created.error);
        return ok({ success: true });
      }
    }
    if (resource === "audit" && method === "GET") {
      admin();
      const page = z.coerce
        .number()
        .int()
        .min(1)
        .parse(url.searchParams.get("page") ?? 1);
      let q = db
        .from("audit_logs")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .order("id", { ascending: false });
      for (const field of ["action", "entity", "actor_id"]) {
        const v = url.searchParams.get(field);
        if (v) q = q.eq(field, z.string().max(100).parse(v));
      }
      const from = url.searchParams.get("from"),
        to = url.searchParams.get("to");
      if (from)
        q = q.gte(
          "created_at",
          z.string().date().parse(from) + "T00:00:00-03:00",
        );
      if (to)
        q = q.lte(
          "created_at",
          z.string().date().parse(to) + "T23:59:59.999-03:00",
        );
      const term = url.searchParams.get("q");
      if (term)
        q = q.ilike("record_id", "%" + z.string().max(100).parse(term) + "%");
      const { data, error, count } = await q.range(
        (page - 1) * 25,
        page * 25 - 1,
      );
      check(error);
      return ok({ data, count });
    }
    throw new HttpError(404, "Recurso não encontrado.");
  } catch (error) {
    if (error instanceof HttpError)
      return ok({ error: error.message }, error.status);
    if (error instanceof ZodError)
      return ok(
        { error: "Verifique os campos informados.", fields: error.flatten() },
        400,
      );
    if (error instanceof Error && error.message === "DATABASE_NOT_CONFIGURED")
      return ok(
        { error: "A conexão com o banco ainda não foi configurada." },
        503,
      );
    if (error instanceof Error && error.message === "ADMIN_NOT_CONFIGURED")
      return ok(
        {
          error:
            "O envio de convites precisa da chave administrativa configurada no servidor.",
        },
        503,
      );
    if (error instanceof Error && error.message === "INVALID_PERIOD")
      return ok(
        { error: "A data final deve ser igual ou posterior à data inicial." },
        400,
      );
    console.error(
      "NC SORTER request failed",
      error instanceof Error ? error.name : "UnknownError",
    );
    return ok({ error: "Não foi possível concluir. Tente novamente." }, 500);
  }
}
export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const DELETE = handle;
