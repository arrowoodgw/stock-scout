/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Required to enable instrumentation.ts (server startup hook)
    instrumentationHook: true
  }
};

export default nextConfig;
