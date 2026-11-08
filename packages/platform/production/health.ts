import { databaseTransaction } from "./database";
import { productionEnabled, productionConfig } from "./config";
export async function health(app: "panda" | "care" | "rehab") {
  if (!productionEnabled())
    return Response.json({
      ok: true,
      app,
      contractVersion: "2.0.0",
      mode: process.env.PANDA_INTEGRATION || "fixture",
    });
  try {
    productionConfig();
    await databaseTransaction(
      "00000000-0000-0000-0000-000000000000",
      null,
      async (client) => {
        const out = await client.query(
          "SELECT version FROM panda_platform.releases WHERE version='20261108_production'",
        );
        if (!out.rows.length) throw Error("migration missing");
      },
    );
    if (app === "panda")
      await Promise.all(
        [3001, 3002].map(async (port) => {
          const path = port === 3001 ? "care" : "rehab";
          const response = await fetch(
            `http://127.0.0.1:${port}/${path}/api/health`,
            { signal: AbortSignal.timeout(2000), cache: "no-store" },
          );
          const out = await response.json();
          if (!response.ok || out.runtime !== "production")
            throw Error("peer not ready");
        }),
      );
    return Response.json(
      { ok: true, app, runtime: "production", contractVersion: "2.1.0" },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      {
        ok: false,
        app,
        error: { code: "NOT_READY", message: "Service is not ready." },
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
