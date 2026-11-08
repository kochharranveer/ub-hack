import { z } from "zod";
import { requestAuth, checkOrigin } from "./auth";
import { productionConfig, productionEnabled } from "./config";
import { DomainError } from "../json-store";
import { readJson } from "../body";
export async function publicAuth(
  req: Request,
  fn: (auth: ReturnType<typeof requestAuth>) => Promise<Response>,
) {
  let auth: ReturnType<typeof requestAuth> | undefined;
  try {
    if (!productionEnabled())
      return Response.json(
        {
          ok: false,
          error: {
            code: "NOT_CONFIGURED",
            message: "Sign-in is available in the production setup.",
          },
        },
        { status: 503 },
      );
    checkOrigin(req);
    auth = requestAuth(req);
    return auth.apply(await fn(auth));
  } catch (error) {
    const status =
      error instanceof DomainError
        ? error.status
        : error instanceof z.ZodError
          ? 400
          : 503;
    const message =
      error instanceof DomainError
        ? error.message
        : status === 400
          ? "Check the form and try again."
          : "Sign-in is temporarily unavailable. Please try again.";
    const response = Response.json(
      { ok: false, error: { code: "AUTH_ERROR", message } },
      { status, headers: { "Cache-Control": "no-store" } },
    );
    return auth ? auth.apply(response) : response;
  }
}
export const Login = z
  .object({ email: z.email().max(254), password: z.string().min(1).max(256) })
  .strict();
export const Password = z
  .object({ password: z.string().min(12).max(256) })
  .strict();
export async function signIn(req: Request) {
  return publicAuth(req, async (auth) => {
    const credentials = Login.parse(await readJson(req));
    const { error } = await auth.client.auth.signInWithPassword(credentials);
    if (error)
      throw new DomainError(
        "UNAUTHENTICATED",
        "Couldn't sign in. Check your email and password, and make sure your email is verified.",
        401,
      );
    return Response.json({ ok: true, data: { signedIn: true } });
  });
}
export async function signOut(req: Request) {
  return publicAuth(req, async (auth) => {
    const { error } = await auth.client.auth.signOut({ scope: "local" });
    if (error)
      throw new DomainError(
        "UNAVAILABLE",
        "Couldn't finish signing out. Please try again.",
        503,
      );
    const response = Response.json({ ok: true, data: { signedOut: true } });
    response.headers.append(
      "Set-Cookie",
      "panda-patient=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0",
    );
    return response;
  });
}
export async function recover(req: Request) {
  return publicAuth(req, async (auth) => {
    const { email } = z
      .object({ email: z.email().max(254) })
      .strict()
      .parse(await readJson(req));
    const { error } = await auth.client.auth.resetPasswordForEmail(email, {
      redirectTo: productionConfig().origin + "/auth/callback?next=/auth/reset",
    });
    if (error && error.status !== 429)
      throw new DomainError(
        "UNAVAILABLE",
        "Password recovery is temporarily unavailable.",
        503,
      );
    return Response.json({
      ok: true,
      data: {
        message:
          "If that email has an account, a recovery link will arrive shortly.",
      },
    });
  });
}
export async function callback(req: Request) {
  return publicAuth(req, async (auth) => {
    const url = new URL(req.url),
      code = url.searchParams.get("code");
    if (!code)
      throw new DomainError(
        "VALIDATION_ERROR",
        "This sign-in link is incomplete.",
        400,
      );
    const { error } = await auth.client.auth.exchangeCodeForSession(code);
    if (error)
      throw new DomainError(
        "UNAUTHENTICATED",
        "This link has expired. Request a new one.",
        401,
      );
    return Response.redirect(
      productionConfig().origin +
        (url.searchParams.get("next") === "/auth/reset" ? "/auth/reset" : "/"),
      303,
    );
  });
}
export async function confirmEmail(req: Request) {
  return publicAuth(req, async (auth) => {
    const url = new URL(req.url),
      token_hash = url.searchParams.get("token_hash"),
      type = url.searchParams.get("type");
    if (
      !token_hash ||
      !["invite", "recovery", "email", "signup"].includes(type || "")
    )
      throw new DomainError(
        "VALIDATION_ERROR",
        "This sign-in link is incomplete.",
        400,
      );
    const { error } = await auth.client.auth.verifyOtp({
      token_hash,
      type: type as "invite" | "recovery" | "email" | "signup",
    });
    if (error)
      throw new DomainError(
        "UNAUTHENTICATED",
        "This link has expired. Request a new one.",
        401,
      );
    return Response.redirect(
      productionConfig().origin +
        (["invite", "recovery"].includes(type!) ? "/auth/reset" : "/"),
      303,
    );
  });
}
