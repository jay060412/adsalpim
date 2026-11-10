import { describe, expect, it } from "vitest";
import { clientKeyFromHeaders, createRateLimiter } from "../rate-limit";

describe("createRateLimiter", () => {
  it("allows up to the limit and then reports when to retry", () => {
    const limiter = createRateLimiter({ limit: 2, windowMs: 60_000 });
    expect(limiter.check("a", 0).allowed).toBe(true);
    expect(limiter.check("a", 1_000).allowed).toBe(true);
    expect(limiter.check("a", 2_000)).toEqual({ allowed: false, retryAfterSec: 58 });
    expect(limiter.check("b", 2_000).allowed).toBe(true);
  });

  it("frees capacity once the window has passed", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 1_000 });
    expect(limiter.check("a", 0).allowed).toBe(true);
    expect(limiter.check("a", 500).allowed).toBe(false);
    expect(limiter.check("a", 1_001).allowed).toBe(true);
  });
});

describe("clientKeyFromHeaders", () => {
  it("uses the first forwarded address", () => {
    expect(
      clientKeyFromHeaders(new Headers({ "x-forwarded-for": "203.0.113.9, 10.0.0.1" })),
    ).toBe("203.0.113.9");
    expect(clientKeyFromHeaders(new Headers())).toBe("unknown");
  });
});
