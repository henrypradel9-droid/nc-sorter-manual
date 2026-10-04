import { z } from "zod";

export const passwordLengthSchema = z.string().min(8).max(128);
