/** @type {import('next').NextConfig} */
const path = require('path')
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  transpilePackages: ['@nile-auth/core', '@nile-auth/logger', '@nile-auth/query'],
  experimental: {
    outputFileTracingRoot: path.join(__dirname, '../../'),
  }
};

module.exports = nextConfig;
