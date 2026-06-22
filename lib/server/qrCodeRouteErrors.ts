import { ZodError } from "zod";
import { NextResponse } from "next/server";
import { ApiError } from "@/lib/server/http";
import { formatZodError } from "@/lib/server/zodErrors";

export function qrCodeValidationResponse(route: string, error: ZodError) {
  const flattened = error.flatten();
  const message = formatZodError(error);
  const details = {
    fieldErrors: flattened.fieldErrors,
    formErrors: flattened.formErrors,
    issues: error.issues.map((issue) => ({
      path: issue.path.join(".") || "body",
      message: issue.message,
      code: issue.code,
    })),
  };

  console.error(`[cq][${route}] QR code validation failed:`, flattened);

  if (process.env.NODE_ENV !== "production") {
    return NextResponse.json(
      {
        error: {
          message,
          code: "VALIDATION_ERROR",
          details,
        },
      },
      { status: 400 },
    );
  }

  return NextResponse.json(
    {
      error: {
        message,
        code: "VALIDATION_ERROR",
      },
    },
    { status: 400 },
  );
}

export function qrCodeApiErrorResponse(route: string, error: ApiError) {
  console.error(`[cq][${route}] QR code request failed:`, {
    code: error.code,
    message: error.message,
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
