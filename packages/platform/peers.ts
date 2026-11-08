import { productionEnabled } from "./production/config";
import { identity } from "./production/context";
import { z } from "zod";
import { CareSnapshotSchema } from "../contracts/care";
import { ReportSchema } from "../contracts/rehab";
import { fixtureCare } from "../contracts/fixtures";
import { DomainError } from "./json-store";
export const connected = () => {
  const mode = process.env.PANDA_INTEGRATION;
  if (mode && mode !== "connected" && mode !== "fixture")
    throw new DomainError("NOT_CONFIGURED", "PANDA_INTEGRATION must be connected or fixture.", 503);
  return mode === "connected";
};
export async function callPeer<T>(
  app: "care" | "rehab",
  route: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const origin =
    app === "care"
      ? process.env.PANDA_CARE_ORIGIN || "http://127.0.0.1:3001"
      : process.env.PANDA_REHAB_ORIGIN || "http://127.0.0.1:3002";
  let response: Response;
  try {
    response = await fetch(origin + "/" + app + "/api/" + route, {
      method,
      cache: "no-store",
      headers: { "Content-Type": "application/json",...(productionEnabled()?{"Authorization":"Bearer "+identity().accessToken,"X-Panda-Patient":identity().patientId||""}:{}) },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    throw new DomainError(
      "PEER_UNAVAILABLE",
      app + " app is unavailable; no fallback data was substituted.",
      503,
    );
  }
  const envelope = await response.json();
  if (!response.ok || !envelope.ok)
    throw new DomainError(
      envelope.error?.code || "PEER_ERROR",
      envelope.error?.message || "Peer failed",
      response.status,
    );
  return envelope.data as T;
}
export async function getCare() {
  return CareSnapshotSchema.parse(
    connected() ? await callPeer("care", "state") : fixtureCare(),
  );
}
export async function getReports() {
  return z
    .array(ReportSchema)
    .parse(connected() ? await callPeer("rehab", "sessions") : []);
}
