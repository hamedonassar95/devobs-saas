import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  ...(process.env.NEXT_OUTPUT_STANDALONE === "true" && {
    output: "standalone",
  }),
};

export default nextConfig;
