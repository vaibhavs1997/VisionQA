const COOKIE_NAME = "session_token";
const WORKSPACE_COOKIE_NAME = "current_workspace_id";

/**
 * Deliberately simple for this phase: the API issues a JWT to the
 * client on login/register, and the browser stores it in a plain
 * (non-httpOnly) cookie set via document.cookie, then every request
 * (server or client component) attaches it as a Bearer token.
 *
 * A production hardening pass would have the API set an httpOnly,
 * Secure, SameSite cookie directly via Set-Cookie so client-side JS
 * never touches the token at all — that requires the web app and API
 * to share a cookie domain (or a same-origin proxy), which is a real
 * infrastructure decision belonging to actual deployment, not this
 * phase's local-dev setup. Flagged here rather than silently assumed
 * production-ready.
 */
export function getClientToken(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${COOKIE_NAME}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export function setClientToken(token: string): void {
  if (typeof document === "undefined") return;
  const maxAge = 60 * 60 * 24 * 7; // 7 days, matches the API's session expiry
  document.cookie = `${COOKIE_NAME}=${encodeURIComponent(token)}; path=/; max-age=${maxAge}; samesite=lax`;
}

export function clearClientToken(): void {
  if (typeof document === "undefined") return;
  document.cookie = `${COOKIE_NAME}=; path=/; max-age=0`;
  document.cookie = `${WORKSPACE_COOKIE_NAME}=; path=/; max-age=0`;
}

export function getClientWorkspaceId(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${WORKSPACE_COOKIE_NAME}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export function setClientWorkspaceId(workspaceId: string): void {
  if (typeof document === "undefined") return;
  document.cookie = `${WORKSPACE_COOKIE_NAME}=${encodeURIComponent(workspaceId)}; path=/; max-age=${60 * 60 * 24 * 30}; samesite=lax`;
}

/** Server-component-only — reads the same cookie via next/headers. */
export async function getServerToken(): Promise<string | null> {
  const { cookies } = await import("next/headers");
  const store = cookies();
  return store.get(COOKIE_NAME)?.value ?? null;
}

export { COOKIE_NAME, WORKSPACE_COOKIE_NAME };
