const nextConfig = {
  reactStrictMode: true,
  output: process.env.EXPORT_STATIC ? "export" : undefined,
  basePath: process.env.EXPORT_STATIC ? "/zippydesk" : undefined,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https://*.googleapis.com https://*.facebook.com" },
        ],
      },
    ];
  },
  async redirects() {
    return process.env.NODE_ENV === "production"
      ? [
          {
            source: "/:path*",
            has: [{ type: "header", key: "x-forwarded-proto", value: "http" }],
            destination: "/:path*",
            permanent: true,
          },
        ]
      : [];
  },
};

export default nextConfig;
