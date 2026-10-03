export type AccessRequest = {
  id: string; auth_user_id: string; name: string; email: string; username: string;
  requested_role: "OPERADOR" | "LIDER";
  status: "PENDENTE" | "APROVADO" | "RECUSADO";
  approved_role: "OPERADOR" | "LIDER" | null;
  approved_by_user_id: string | null; approved_at: string | null;
  rejected_by_user_id: string | null; rejected_at: string | null;
  rejection_reason: string | null; created_at: string; updated_at: string;
};
