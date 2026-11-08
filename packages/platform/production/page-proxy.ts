import { NextResponse, type NextRequest } from "next/server";
import { productionEnabled, productionConfig } from "./config";
import { requestAuth } from "./auth";
/** Page checks improve navigation; every API independently verifies identity and permission. */
export async function protectPage(req: NextRequest) {
  if (!productionEnabled()) return NextResponse.next();
  const path = req.nextUrl.pathname;
  if (
    path.includes("/api/") ||
    path.startsWith("/auth") ||
    path.includes("/_next/") ||
    /\.(?:ico|png|svg|jpg|css|js|woff2?)$/.test(path)
  )
    return NextResponse.next();
  try {
    const auth = requestAuth(req);
    const { data, error } = await auth.client.auth.getUser();
    const response =
      !error && data.user?.email_confirmed_at
        ? NextResponse.next()
        : NextResponse.redirect(new URL("/auth", productionConfig().origin));
    return auth.apply(response);
  } catch {
    return new Response("Panda sign-in is temporarily unavailable.", {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
