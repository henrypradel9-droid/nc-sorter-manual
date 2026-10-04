import { z } from "zod";
import { passwordLengthSchema } from "./password.ts";

export const publicRole = z.enum(["OPERADOR", "LIDER"]);
export const accessRequestSchema = z.object({
  name: z.string().trim().min(3).max(150),
  email: z.string().trim().toLowerCase().email().max(254),
  username: z.string().trim().toLowerCase().min(3).max(50).regex(/^[a-z0-9._-]+$/),
  password: passwordLengthSchema.regex(/[a-z]/).regex(/[A-Z]/).regex(/[0-9]/),
  confirm_password: z.string(),
  requested_role: publicRole,
}).strict().refine(v => v.password === v.confirm_password, {
  message: "As senhas precisam ser iguais.", path: ["confirm_password"],
});
export const decisionSchema = z.discriminatedUnion("decision", [
  z.object({ decision: z.literal("APROVADO"), approved_role: publicRole }).strict(),
  z.object({ decision: z.literal("RECUSADO"), reason: z.string().trim().min(3).max(2000) }).strict(),
]);
