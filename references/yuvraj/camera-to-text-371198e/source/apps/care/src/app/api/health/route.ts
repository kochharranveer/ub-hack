export function GET() {
  return Response.json({
    ok: true,
    app: "care",
    owner: "Asmita",
    contractVersion: "2.0.0",
    mode: process.env.PANDA_INTEGRATION || "fixture",
  });
}
