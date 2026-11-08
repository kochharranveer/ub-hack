import { securityHeaders } from "../../packages/platform/production/security-headers";
import path from "node:path";
import type { NextConfig } from "next";
const config: NextConfig = {
  poweredByHeader:false,
  serverExternalPackages:["pg"],
  experimental:{proxyClientMaxBodySize:"11mb"},
  async headers(){return [{source:"/:path*",headers:process.env.PANDA_RUNTIME==="production"?securityHeaders:securityHeaders.filter(h=>!["Content-Security-Policy","Strict-Transport-Security"].includes(h.key))}];},
  basePath: "/care",
  turbopack: { root: path.resolve(process.cwd(), "../..") },
  allowedDevOrigins: process.env.PANDA_DEV_ORIGIN
    ? [process.env.PANDA_DEV_ORIGIN]
    : [],
};
export default config;
