import { withWorkflow } from "workflow/next";
import type { NextConfig } from "next";
const config: NextConfig = {
  serverExternalPackages: ["ffmpeg-static", "ffprobe-static", "sharp"],
  outputFileTracingIncludes: {
    "/*": [
      "./node_modules/ffmpeg-static/ffmpeg",
      "./node_modules/ffprobe-static/bin/linux/x64/ffprobe",
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};
export default withWorkflow(config);
