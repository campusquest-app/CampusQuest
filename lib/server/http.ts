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

  return NextResponse.json(
    {
      error: {
        message: "Unexpected server error.",
        code: "INTERNAL_ERROR",
      },
    },
    { status: 500 },
  );
}

