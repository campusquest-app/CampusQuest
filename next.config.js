/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    // Baked at build time; logged on app load so stale PWA caches are obvious.
    NEXT_PUBLIC_BUILD_TIMESTAMP: new Date().toISOString(),
  },
  async redirects() {
    return [
      { source: "/dashboard", destination: "/", permanent: false },
    ];
  },
};

module.exports = nextConfig;
