import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // A restore uploads the whole register; the 1 MB default would refuse any real one.
    serverActions: { bodySizeLimit: "200mb" },
  },
};

export default nextConfig;
