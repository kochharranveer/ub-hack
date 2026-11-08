import path from "node:path";
import type { NextConfig } from "next";
const config: NextConfig = {
  basePath: "",
  turbopack: { root: path.resolve(process.cwd(), "../..") },
  allowedDevOrigins: process.env.PANDA_DEV_ORIGIN
    ? [process.env.PANDA_DEV_ORIGIN]
    : [],
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
