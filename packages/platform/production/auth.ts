import { AsyncLocalStorage } from "node:async_hooks";
import {
  createServerClient,
  parseCookieHeader,
  serializeCookieHeader,
  type CookieOptions,
} from "@supabase/ssr";
import { DomainError } from "../json-store";
import { productionConfig } from "./config";
import { accountIdentity } from "./accounts";
export function requestAuth(req: Request) {
  const config = productionConfig();
  const changes = new Map<string, { value: string; options: CookieOptions }>();
  const cookies = new Map(
    parseCookieHeader(req.headers.get("cookie") || "")
      .filter((c) => c.value !== undefined)
      .map((c) => [c.name, c.value!]),
  );
  const client = createServerClient(config.supabaseUrl, config.publishableKey, {
    cookieOptions: { httpOnly: true, secure: true, sameSite: "lax", path: "/" },
    cookies: {
      getAll: () => [...cookies].map(([name, value]) => ({ name, value })),
      setAll: (values) => {
        for (const c of values) {
          cookies.set(c.name, c.value);
          changes.set(c.name, c);
        }
      },
    },
  });
  return {
    client,
    cookies,
    apply(original: Response) {
      const response = new Response(original.body, {
        status: original.status,
        statusText: original.statusText,
        headers: new Headers(original.headers),
      });
      for (const [name, c] of changes)
        response.headers.append(
          "Set-Cookie",
          serializeCookieHeader(name, c.value, {
            ...c.options,
            httpOnly: true,
            secure: true,
            sameSite: "lax",
            path: "/",
          }),
        );
      response.headers.set("Cache-Control", "private, no-store, max-age=0");
      return response;
    },
  };
}
export function checkOrigin(req: Request) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return;
  const origin = req.headers.get("origin");
  // Non-browser peer/API clients use an explicitly verified bearer token.
  if (!origin && /^Bearer [^ ]+$/.test(req.headers.get("authorization") || ""))
    return;
  if (origin !== productionConfig().origin)
    throw new DomainError(
      "FORBIDDEN",
      "This request must come from Panda's own site.",
      403,
    );
}
export async function authenticate(req: Request, auth = requestAuth(req)) {
  const bearer = req.headers.get("authorization");
  const token = bearer?.startsWith("Bearer ") ? bearer.slice(7) : undefined;
  const { data, error } = await auth.client.auth.getUser(token);
  if (error || !data.user || !data.user.email_confirmed_at)
    throw new DomainError(
      "UNAUTHENTICATED",
      "Please sign in with a verified account.",
      401,
    );
  // getSession is used only to forward credentials AFTER getUser verifies identity.
  const accessToken =
    token || (await auth.client.auth.getSession()).data.session?.access_token;
  if (!accessToken)
    throw new DomainError(
      "UNAUTHENTICATED",
      "Your session expired. Please sign in again.",
      401,
    );
  return accountIdentity(
    data.user.id,
    String(data.user.user_metadata?.display_name || ""),
    req.headers.get("x-panda-patient") || auth.cookies.get("panda-patient"),
    accessToken,
    Boolean(data.user.invited_at),
  );
}
export function authorizeOperation(
  role: "patient" | "clinician",
  path: string,
  method: string,
) {
  const clinicianWrite =
    /^\/care\/api\/(?:plans\/|(?:help|reports)\/[^/]+\/ack$)/.test(path);
  const cvMutation=method!=="GET"&&/^\/rehab\/api\/cv\//.test(path);
  const patientOnly = cvMutation ||
    /^\/api\/(?:voice\/|context$)/.test(path) ||
    (method !== "GET" &&
      /^\/(?:care\/api\/(?:help$|tasks\/)|rehab\/api\/sessions)/.test(path));
  if (
    (clinicianWrite && role !== "clinician") ||
    (patientOnly && role !== "patient")
  )
    throw new DomainError(
      "FORBIDDEN",
      clinicianWrite
        ? "This action requires an assigned clinician."
        : "This action belongs to the patient account.",
      403,
    );
}

const authRuntime = globalThis as typeof globalThis & {
  __pandaRequestAuth?: AsyncLocalStorage<ReturnType<typeof requestAuth>>;
};
export const requestAuthScope = (authRuntime.__pandaRequestAuth ??=
  new AsyncLocalStorage<ReturnType<typeof requestAuth>>());
export function currentAuth() {
  const auth = requestAuthScope.getStore();
  if (!auth) throw new DomainError("UNAUTHENTICATED", "Please sign in.", 401);
  return auth;
}
