import type { NextConfig } from "next";

import pkg from "./package.json";

// Single-source the version from package.json (see lib/version.ts). Inlined at
// build time, so bumping the version is a package.json edit + rebuild. Only the
// version string crosses into the client bundle.
const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_APP_VERSION: pkg.version,
  },
  // Required for the Docker deployment that ships with this repo.
  output: "standalone",
};

export default nextConfig;
