import { z } from "zod";
export const CONTRACT_VERSION = "2.0.0" as const;
export const PATIENT_ID = "pat-demo-001";
export const RequestSchema = z
  .object({ requestId: z.string().min(8).max(100) })
  .strict();
export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };
