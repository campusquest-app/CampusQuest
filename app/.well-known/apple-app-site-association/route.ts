import { NextResponse } from "next/server";

const ASSOCIATION = {
  applinks: {
    apps: [],
    details: [
      {
        appID: "22HZFLJZ9X.com.nicklockhart.campusquest",
        paths: [
          "/auth/reset-password",
          "/auth/reset-password/*",
          "/auth/callback",
          "/auth/callback/*",
        ],
      },
    ],
  },
};

export function GET() {
  return NextResponse.json(ASSOCIATION, {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
