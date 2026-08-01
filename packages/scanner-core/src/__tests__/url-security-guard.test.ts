import { describe, it, expect } from "vitest";
import { assertUrlIsSafe, assertRedirectCountAllowed, UrlSecurityError } from "../security/url-security-guard";

describe("assertUrlIsSafe", () => {
  it("rejects non-http(s) protocols", async () => {
    await expect(assertUrlIsSafe("file:///etc/passwd")).rejects.toThrow(UrlSecurityError);
    await expect(assertUrlIsSafe("javascript:alert(1)")).rejects.toThrow(UrlSecurityError);
    await expect(assertUrlIsSafe("ftp://example.test/file")).rejects.toThrow(UrlSecurityError);
  });

  it("rejects an invalid URL string", async () => {
    await expect(assertUrlIsSafe("not a url")).rejects.toThrow(UrlSecurityError);
  });

  it("rejects localhost", async () => {
    await expect(assertUrlIsSafe("http://localhost:3000/")).rejects.toThrow(UrlSecurityError);
    await expect(assertUrlIsSafe("http://foo.localhost/")).rejects.toThrow(UrlSecurityError);
  });

  it("rejects loopback literal IPs", async () => {
    await expect(assertUrlIsSafe("http://127.0.0.1/")).rejects.toThrow(UrlSecurityError);
    await expect(assertUrlIsSafe("http://[::1]/")).rejects.toThrow(UrlSecurityError);
  });

  it("rejects the AWS/GCP/Azure cloud metadata endpoint", async () => {
    await expect(assertUrlIsSafe("http://169.254.169.254/latest/meta-data/")).rejects.toThrow(UrlSecurityError);
  });

  it("rejects RFC1918 private ranges", async () => {
    await expect(assertUrlIsSafe("http://10.0.0.5/")).rejects.toThrow(UrlSecurityError);
    await expect(assertUrlIsSafe("http://172.16.0.5/")).rejects.toThrow(UrlSecurityError);
    await expect(assertUrlIsSafe("http://192.168.1.1/")).rejects.toThrow(UrlSecurityError);
  });

  it("allows a public literal IP", async () => {
    // 8.8.8.8 is Google's public DNS — a legitimate public address that
    // must NOT be blocked by the private-range guard.
    await expect(assertUrlIsSafe("http://8.8.8.8/")).resolves.toBeInstanceOf(URL);
  });

  it("tags the specific rejection reason for programmatic handling", async () => {
    try {
      await assertUrlIsSafe("http://192.168.1.1/");
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(UrlSecurityError);
      expect((err as UrlSecurityError).reason).toBe("private-address");
    }
  });
});

describe("assertRedirectCountAllowed", () => {
  it("allows counts under the max", () => {
    expect(() => assertRedirectCountAllowed(3, { maxRedirects: 10 })).not.toThrow();
  });

  it("rejects counts exceeding the max", () => {
    expect(() => assertRedirectCountAllowed(11, { maxRedirects: 10 })).toThrow(UrlSecurityError);
  });
});
