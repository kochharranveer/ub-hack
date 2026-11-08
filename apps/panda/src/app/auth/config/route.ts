import { productionEnabled } from "@platform/production/config";
export const dynamic = "force-dynamic";
export function GET() {
  return Response.json(
    { enabled: productionEnabled() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
