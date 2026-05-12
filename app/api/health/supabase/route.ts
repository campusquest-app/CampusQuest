import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = createServerSupabaseClient();
    const { error } = await supabase.auth.getSession();
    if (error) {
      throw error;
    }

    return NextResponse.json(
      {
        status: "ok",
        supabase: "connected",
      },
      { status: 200 },
    );
  } catch (error) {
    const base = {
      status: "error",
      supabase: "disconnected",
    };

    if (process.env.NODE_ENV !== "production") {
      const message = error instanceof Error ? error.message : "Unknown Supabase connection error.";
      return NextResponse.json(
        {
          ...base,
          error: message,
        },
        { status: 500 },
      );
    }

    return NextResponse.json(base, { status: 500 });
  }
}

