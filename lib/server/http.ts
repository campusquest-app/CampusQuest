import { NextResponse } from "next/server";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string,
  ) {
    super(message);
  }
}

export function ok<T>(data: T, status = 200) {
  return NextResponse.json({ data }, { status });
}

export function fail(error: unknown) {
  if (error instanceof ApiError) {
    console.error("[cq][api] ApiError", {
      status: error.status,
      code: error.code,
      message: error.message,
      stack: error.stack,
    });
    return NextResponse.json(
      {
        error: {
          message: error.message,
          code: error.code ?? "API_ERROR",
        },
      },
      { status: error.status },
    );
  }

  console.error("[cq][api] Unexpected error", error);
  if (error instanceof Error && error.stack) {
    console.error(error.stack);
  }

  const message =
    process.env.NODE_ENV !== "production" && error instanceof Error && error.message.trim()
      ? error.message
      : "Unexpected server error.";

  return NextResponse.json(
    {
      error: {
        message,
        code: "INTERNAL_ERROR",
      },
    },
    { status: 500 },
  );
}

