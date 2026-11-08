import { ZodError } from "zod";
import { DomainError } from "./json-store";
export async function respond<T>(fn: () => Promise<T> | T) {
  try {
    return Response.json(
      { ok: true, data: await fn() },
      {
        headers: {
          "Cache-Control": "no-store",
          "X-Panda-Mode": "synthetic-demo",
        },
      },
    );
  } catch (e) {
    if (e instanceof ZodError)
      return Response.json(
        {
          ok: false,
          error: {
            code: "VALIDATION_ERROR",
            message: e.issues.map((i) => i.message).join("; "),
          },
        },
        { status: 400 },
      );
    if (e instanceof SyntaxError)
      return Response.json(
        {
          ok: false,
          error: { code: "VALIDATION_ERROR", message: "Invalid JSON" },
        },
        { status: 400 },
      );
    if (e instanceof DomainError)
      return Response.json(
        { ok: false, error: { code: e.code, message: e.message } },
        { status: e.status },
      );
    console.error(
      "Panda request failed:",
      e instanceof Error ? e.message : "unknown",
    );
    return Response.json(
      {
        ok: false,
        error: {
          code: "UNAVAILABLE",
          message:
            "Service unavailable. Retry without changing the request ID.",
        },
      },
      { status: 503 },
    );
  }
}
