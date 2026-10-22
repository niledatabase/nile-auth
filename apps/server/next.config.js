/** @type {import('next').NextConfig} */
const path = require("path");
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  transpilePackages: [
    "@nile-auth/core",
    "@nile-auth/logger",
    "@nile-auth/query",
  ],
  outputFileTracingRoot: path.join(__dirname, "../../"),
  serverExternalPackages: ["dd-trace"],
  outputFileTracingIncludes: {
    "/*": ["./tracing.cjs"],
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = [
        ...(config.externals || []),
        "graphql/language/visitor",
        "graphql/language/printer",
        "graphql/utilities",
      ];
    }
    return config;
  },
};

module.exports = nextConfig;
