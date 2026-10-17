/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    // Baked at build time; logged on app load so stale PWA caches are obvious.
    NEXT_PUBLIC_BUILD_TIMESTAMP: new Date().toISOString(),
  },
  images: {
    // Quad feed may route public Supabase objects through `/_next/image` for
    // mobile-sized variants when Storage image transforms are unavailable.
    formats: ["image/avif", "image/webp"],
    deviceSizes: [360, 640, 750, 828, 1080, 1200],
    imageSizes: [64, 128, 256, 384],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/render/image/public/**",
      },
    ],
  },
  async redirects() {
    return [
      { source: "/dashboard", destination: "/", permanent: false },
      { source: "/privacy", destination: "/legal/privacy", permanent: true },
      { source: "/terms", destination: "/legal/terms", permanent: true },
    ];
  },
  async headers() {
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://maps.googleapis.com https://maps.gstatic.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' data: https://fonts.gstatic.com",
      "img-src 'self' data: blob: https:",
      "media-src 'self' blob: https://*.supabase.co",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://maps.googleapis.com https://maps.gstatic.com https://www.gstatic.com",
      // Google Maps vector (Map ID) rendering decodes tiles in blob: Web Workers.
      "worker-src 'self' blob:",
      "frame-src 'self' https://www.youtube-nocookie.com https://www.google.com https://maps.google.com",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join("; ");
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(self), microphone=(self), geolocation=(self), payment=()",
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
