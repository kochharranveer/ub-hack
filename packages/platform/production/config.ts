import { DomainError } from "../json-store";
export function productionEnabled() {
  const mode = process.env.PANDA_RUNTIME || "demo";
  if (!["demo", "production"].includes(mode))
    throw new DomainError(
      "NOT_CONFIGURED",
      "PANDA_RUNTIME must be demo or production.",
      503,
    );
  return mode === "production";
}
export function productionConfig() {
  const names = [
    "PANDA_SUPABASE_URL",
    "PANDA_SUPABASE_PUBLISHABLE_KEY",
    "PANDA_DATABASE_URL",
  ] as const;
  const missing = names.filter((name) => !process.env[name]);
  if (missing.length)
    throw new DomainError(
      "NOT_CONFIGURED",
      "Production configuration missing: " + missing.join(", "),
      503,
    );
  const publicOrigin =
    process.env.PANDA_PUBLIC_ORIGIN || process.env.RENDER_EXTERNAL_URL;
  if (!publicOrigin)
    throw new DomainError(
      "NOT_CONFIGURED",
      "PANDA_PUBLIC_ORIGIN is required outside Render.",
      503,
    );
  const origin = new URL(publicOrigin),
    supabase = new URL(process.env.PANDA_SUPABASE_URL!);
  if (
    origin.protocol !== "https:" ||
    origin.origin !== publicOrigin ||
    supabase.protocol !== "https:"
  )
    throw new DomainError(
      "NOT_CONFIGURED",
      "Production requires an HTTPS public origin and Supabase URL.",
      503,
    );
  const key = process.env.PANDA_SUPABASE_PUBLISHABLE_KEY!;
  let role = "";
  try {
    role = JSON.parse(
      Buffer.from(key.split(".")[1] || "", "base64url").toString(),
    ).role;
  } catch {}
  if (key.startsWith("sb_secret_") || role === "service_role")
    throw new DomainError(
      "NOT_CONFIGURED",
      "Use a Supabase publishable key for authentication, never a service-role key.",
      503,
    );
  if (process.env.PANDA_INTEGRATION !== "connected")
    throw new DomainError(
      "NOT_CONFIGURED",
      "Production requires connected Care and Rehab apps.",
      503,
    );
  return {
    origin: origin.origin,
    supabaseUrl: supabase.origin,
    publishableKey: key,
  };
}
