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
  experimental: {
    outputFileTracingRoot: path.join(__dirname, "../../"),
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = [
        ...(config.externals || []),
        "graphql/language/visitor",
        "graphql/language/printer",
        "graphql/utilities",
        "dd-trace",
        "dd-trace/packages/datadog-plugin-openai",
        "dd-trace/packages/datadog-plugin-graphql",
      ];
    }
    return config;
  },
};

module.exports = nextConfig;
