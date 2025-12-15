import type { NextConfig } from "next";
import path from "path";

const PINO_BROWSER_PATH = path.resolve(__dirname, "node_modules/pino/browser.js");

const nextConfig: NextConfig = {
  turbopack: {
    // Turbopack is enabled by default in Next.js 16. Keep an equivalent alias
    // to avoid bundling failures if `tape` is pulled in from dependency tests.
    resolveAlias: {
      // Ensure client bundles use pino's browser build (otherwise it pulls in
      // transports -> thread-stream -> dev-only test/bench files).
      pino: PINO_BROWSER_PATH,
      tape: path.resolve(__dirname, "src/shims/tape.js"),
    },
  },
  webpack: (config) => {
    // Prevent build failures if a transitive dependency accidentally pulls in
    // `thread-stream/test/*` which requires the `tape` test runner.
    config.resolve = config.resolve || {};
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      pino: PINO_BROWSER_PATH,
      tape: path.resolve(__dirname, "src/shims/tape.js"),
    };
    return config;
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'pbs.twimg.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'abs.twimg.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'imagedelivery.net',
        pathname: '/**',
      },
    ],
  },
};

export default nextConfig;
