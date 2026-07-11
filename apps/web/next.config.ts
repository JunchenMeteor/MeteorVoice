import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: [
    "@meteorvoice/api-client",
    "@meteorvoice/session-core",
    "@meteorvoice/shared",
  ],
  turbopack: {
    root: path.join(__dirname, "../.."),
  },
};

export default nextConfig;
