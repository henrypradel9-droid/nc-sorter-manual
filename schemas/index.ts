import { z } from "zod";
import { roles, statuses } from "@/lib/domain";
const text = z.string().trim();
export const occurrenceSchema = z
  .object({
    id: z.string().uuid(),
    occurred_at: z.string().datetime({ offset: true }),
    package_id: text.max(100).default(""),
    hu: text.max(100).default(""),
    occurrence_user: text.min(1).max(100),
    package_quantity: z.number().int().min(1).max(1000000),
    error_type_id: z.string().uuid(),
    shift_id: z.string().uuid(),
    canalizacao_id: z.string().uuid(),
    status: z.enum(statuses),
    tt: text.max(200).default(""),
    observations: text.max(4000).default(""),
    version: z.number().int().positive().optional(),
  })
  .strict();
export const catalogSchema = z
  .object({
    id: z.string().uuid().optional(),
    name: text.min(1).max(150),
    description: text.max(1000).default(""),
    active: z.boolean().default(true),
    start_time: z
      .string()
      .regex(/^\d{2}:\d{2}(:\d{2})?$/)
      .nullable()
      .optional(),
    end_time: z
      .string()
      .regex(/^\d{2}:\d{2}(:\d{2})?$/)
      .nullable()
      .optional(),
  })
  .strict();
export const profileSchema = z
  .object({
    id: z.string().uuid(),
    name: text.min(1).max(150),
    role: z.enum(roles),
    active: z.boolean(),
  })
  .strict();
export const inviteSchema = z
  .object({
    email: z.string().email(),
    name: text.min(1).max(150),
    role: z.enum(roles),
  })
  .strict();
export const settingsSchema = z
  .object({
    recurrence_limit: z.number().int().min(1).max(10000),
    operational_start_hour: z.number().int().min(0).max(23),
  })
  .strict();
export const followUpSchema = z
  .object({ alert_id: z.string().uuid(), note: text.min(3).max(4000) })
  .strict();
export const filterSchema = z.object({
  q: text.max(100).default(""),
  from_at: z.string().datetime({ offset: true }).optional(),
  to_at: z.string().datetime({ offset: true }).optional(),
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  occurrence_user: text.max(100).optional(),
  error_type_id: z.string().uuid().optional(),
  shift_id: z.string().uuid().optional(),
  canalizacao_id: z.string().uuid().optional(),
  registered_by_user_id: z.string().uuid().optional(),
  status: z.enum(statuses).optional(),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  page_size: z.coerce
    .number()
    .refine((n) => [25, 50, 100].includes(n))
    .default(25),
});
