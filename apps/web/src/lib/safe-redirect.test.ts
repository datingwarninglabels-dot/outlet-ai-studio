import { describe, expect, it } from "vitest";
import { sanitizeCallbackUrl } from "./safe-redirect";

describe("sanitizeCallbackUrl — open-redirect prevention for post-login navigation", () => {
  it("defaults to /dashboard when no callbackUrl is given", () => {
    expect(sanitizeCallbackUrl(null)).toBe("/dashboard");
    expect(sanitizeCallbackUrl(undefined)).toBe("/dashboard");
    expect(sanitizeCallbackUrl("")).toBe("/dashboard");
  });

  it("passes through a same-origin relative path", () => {
    expect(sanitizeCallbackUrl("/projects/123")).toBe("/projects/123");
  });

  it("rejects a protocol-relative URL (//evil.example) rather than treating it as relative", () => {
    expect(sanitizeCallbackUrl("//evil.example")).toBe("/dashboard");
  });

  it("rejects an absolute URL with a scheme, even same-host", () => {
    expect(sanitizeCallbackUrl("https://evil.example/steal")).toBe("/dashboard");
    expect(sanitizeCallbackUrl("http://localhost:3000/dashboard")).toBe("/dashboard");
  });

  it("rejects a path with no leading slash", () => {
    expect(sanitizeCallbackUrl("dashboard")).toBe("/dashboard");
  });

  it("refuses to redirect back to /login or /setup, which would loop", () => {
    expect(sanitizeCallbackUrl("/login")).toBe("/dashboard");
    expect(sanitizeCallbackUrl("/setup")).toBe("/dashboard");
  });

  it("checks the disallowed-target path ignoring query/hash so /login?next=x still redirects", () => {
    expect(sanitizeCallbackUrl("/login?callbackUrl=%2Fdashboard")).toBe("/dashboard");
    expect(sanitizeCallbackUrl("/setup#step2")).toBe("/dashboard");
  });

  it("preserves query strings and hashes on an otherwise-safe path", () => {
    expect(sanitizeCallbackUrl("/projects/123?tab=scenes")).toBe("/projects/123?tab=scenes");
  });
});
