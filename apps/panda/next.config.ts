import { securityHeaders } from "../../packages/platform/production/security-headers";
import path from "node:path";
import type { NextConfig } from "next";
import { PATIENT_ROUTES } from "../../packages/ui/patient-navigation";
const config: NextConfig = {
  poweredByHeader:false,
  serverExternalPackages:["pg"],
  experimental:{proxyClientMaxBodySize:"11mb"},
  async headers(){return [{source:"/:path*",headers:process.env.PANDA_RUNTIME==="production"?securityHeaders:securityHeaders.filter(h=>!["Content-Security-Policy","Strict-Transport-Security"].includes(h.key))}];},
  basePath: "",
  turbopack: { root: path.resolve(process.cwd(), "../..") },
  allowedDevOrigins: process.env.PANDA_DEV_ORIGIN
    ? [process.env.PANDA_DEV_ORIGIN]
    : [],
  async redirects() {
    // Match only the retired page. Keep every /rehab/api and model asset intact.
    return [{ source: "/rehab", destination: PATIENT_ROUTES.exercise, permanent: false }];
  },
  async rewrites() {
    return [
      {
        source: "/care/:path*",
        destination: `${process.env.PANDA_CARE_ORIGIN || "http://127.0.0.1:3001"}/care/:path*`,
      },
      {
        source: "/rehab/:path*",
        destination: `${process.env.PANDA_REHAB_ORIGIN || "http://127.0.0.1:3002"}/rehab/:path*`,
      },
    ];
  },
};
export default config;
