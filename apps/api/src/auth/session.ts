import jwt from "jsonwebtoken";

export interface SessionClaims {
  userId: string;
}

const SESSION_TTL = "7d";

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    // Fail loudly in any environment that isn't explicitly local dev —
    // an unset session secret is a critical misconfiguration, not
    // something to silently default around (unlike the storage signing
    // secret, which only protects evidence URLs; this protects login
    // sessions for every user).
    if (process.env.NODE_ENV === "production") {
      throw new Error("JWT_SECRET must be set in production.");
    }
    return "dev-only-insecure-jwt-secret";
  }
  return secret;
}

export function issueSessionToken(claims: SessionClaims): string {
  return jwt.sign(claims, getJwtSecret(), { expiresIn: SESSION_TTL });
}

export function verifySessionToken(token: string): SessionClaims | null {
  try {
    const decoded = jwt.verify(token, getJwtSecret());
    if (typeof decoded === "string" || !decoded.userId) return null;
    return { userId: decoded.userId as string };
  } catch {
    return null;
  }
}
