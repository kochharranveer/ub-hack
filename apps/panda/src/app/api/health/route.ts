export function GET() {
  return Response.json({
    ok: true,
    app: "panda",
    owner: "Ranveer",
    contractVersion: "2.0.0",
    mode: process.env.PANDA_INTEGRATION || "fixture",
  });
}
