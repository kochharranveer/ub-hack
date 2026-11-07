import path from "node:path";
import type { NextConfig } from "next";
const config: NextConfig = {
  basePath: "/rehab",
  turbopack: { root: path.resolve(process.cwd(), "../..") },
  allowedDevOrigins: process.env.PANDA_DEV_ORIGIN
    ? [process.env.PANDA_DEV_ORIGIN]
    : [],
};
export default config;
