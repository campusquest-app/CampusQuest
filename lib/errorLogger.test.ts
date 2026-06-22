import { describe, expect, it, vi } from "vitest";
import { logError } from "./errorLogger";

describe("logError", () => {
  it("logs structured payload without throwing", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    logError(new Error("boom"), { component: "TestComponent", meta: { password: "secret" } });
    expect(spy).toHaveBeenCalledOnce();
    const payload = spy.mock.calls[0]?.[1] as { error: { message: string }; meta?: Record<string, unknown> };
    expect(payload.error.message).toBe("boom");
    expect(payload.meta?.password).toBe("[redacted]");
    spy.mockRestore();
  });
});
