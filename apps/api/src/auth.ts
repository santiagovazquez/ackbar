import type { NextFunction, Request, Response } from "express";
import { OAuth2Client } from "google-auth-library";
import { createHash, randomBytes } from "node:crypto";
import { config } from "./config.js";
import { db } from "./db.js";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  username: string | null;
  whatsapp: string | null;
}
declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

const google = new OAuth2Client(config.googleClientId);
const localTokenPrefix = "local-user:";
export const sessionCookieName = "ackbar_session";
const sessionDurationMs = 30 * 24 * 60 * 60 * 1000;
const renewalWindowMs = 15 * 24 * 60 * 60 * 1000;

const hashSessionToken = (token: string) => createHash("sha256").update(token).digest("hex");

function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: sessionDurationMs,
    path: "/",
    ...(config.sessionCookieDomain ? { domain: config.sessionCookieDomain } : {}),
  };
}

function cookieValue(req: Request, name: string) {
  const cookies = req.headers.cookie?.split(";") ?? [];
  for (const cookie of cookies) {
    const separator = cookie.indexOf("=");
    if (separator < 0 || cookie.slice(0, separator).trim() !== name) continue;
    try {
      return decodeURIComponent(cookie.slice(separator + 1));
    } catch {
      return null;
    }
  }
  return null;
}

export async function createSession(res: Response, userId: string) {
  const token = randomBytes(32).toString("base64url");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + sessionDurationMs);
  await db.execute({ sql: `DELETE FROM sessions WHERE expires_at<=?`, args: [now.toISOString()] });
  await db.execute({
    sql: `INSERT INTO sessions (token_hash,user_id,expires_at,created_at) VALUES (?,?,?,?)`,
    args: [hashSessionToken(token), userId, expiresAt.toISOString(), now.toISOString()],
  });
  res.cookie(sessionCookieName, token, sessionCookieOptions());
}

export async function destroySession(req: Request, res: Response) {
  const token = cookieValue(req, sessionCookieName);
  if (token) {
    await db.execute({
      sql: `DELETE FROM sessions WHERE token_hash=?`,
      args: [hashSessionToken(token)],
    });
    res.clearCookie(sessionCookieName, {
      ...sessionCookieOptions(),
      maxAge: undefined,
    });
  }
}

export function localAuthToken(userId: string) {
  return `${localTokenPrefix}${encodeURIComponent(userId)}`;
}

export async function authenticateLocalToken(token: string): Promise<AuthUser | null> {
  if (!config.localAuthEnabled || !token.startsWith(localTokenPrefix)) return null;
  let id: string;
  try {
    id = decodeURIComponent(token.slice(localTokenPrefix.length));
  } catch {
    return null;
  }
  if (!id) return null;
  const result = await db.execute({
    sql: `SELECT id,email,name,avatar_url,username,whatsapp FROM users WHERE id=?`,
    args: [id],
  });
  const user = result.rows[0];
  return user
    ? {
        id: String(user.id),
        email: String(user.email),
        name: String(user.name),
        avatarUrl: user.avatar_url == null ? null : String(user.avatar_url),
        username: user.username == null ? null : String(user.username),
        whatsapp: user.whatsapp == null ? null : String(user.whatsapp),
      }
    : null;
}

export async function verifyIdentityToken(token: string) {
  const ticket = await google.verifyIdToken({ idToken: token, audience: config.googleClientId });
  return ticket.getPayload();
}

export async function authenticateGoogleToken(token: string): Promise<AuthUser | null> {
  if (!config.googleClientId) return null;
  const payload = await verifyIdentityToken(token);
  if (!payload?.sub || !payload.email || !payload.name) return null;
  const id = `usr_${payload.sub}`;
  await db.execute({
    sql: `INSERT INTO users (id, google_sub, email, name, avatar_url) VALUES (?, ?, ?, ?, ?) ON CONFLICT(google_sub) DO UPDATE SET email=excluded.email, name=excluded.name, avatar_url=excluded.avatar_url`,
    args: [id, payload.sub, payload.email, payload.name, payload.picture ?? null],
  });
  const saved = await db.execute({
    sql: `SELECT username,whatsapp FROM users WHERE id=?`,
    args: [id],
  });
  return {
    id,
    email: payload.email,
    name: payload.name,
    avatarUrl: payload.picture ?? null,
    username: saved.rows[0]?.username == null ? null : String(saved.rows[0].username),
    whatsapp: saved.rows[0]?.whatsapp == null ? null : String(saved.rows[0].whatsapp),
  };
}

async function authenticateSession(req: Request, res: Response) {
  const token = cookieValue(req, sessionCookieName);
  if (!token) return null;
  const tokenHash = hashSessionToken(token);
  const result = await db.execute({
    sql: `SELECT s.expires_at,u.id,u.email,u.name,u.avatar_url,u.username,u.whatsapp FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=?`,
    args: [tokenHash],
  });
  const row = result.rows[0];
  if (!row) return null;
  const expiresAt = new Date(String(row.expires_at)).getTime();
  if (expiresAt <= Date.now()) {
    await db.execute({ sql: `DELETE FROM sessions WHERE token_hash=?`, args: [tokenHash] });
    return null;
  }
  if (expiresAt - Date.now() < renewalWindowMs) {
    const renewedExpiry = new Date(Date.now() + sessionDurationMs).toISOString();
    await db.execute({
      sql: `UPDATE sessions SET expires_at=? WHERE token_hash=?`,
      args: [renewedExpiry, tokenHash],
    });
    res.cookie(sessionCookieName, token, sessionCookieOptions());
  }
  return {
    id: String(row.id),
    email: String(row.email),
    name: String(row.name),
    avatarUrl: row.avatar_url == null ? null : String(row.avatar_url),
    username: row.username == null ? null : String(row.username),
    whatsapp: row.whatsapp == null ? null : String(row.whatsapp),
  } satisfies AuthUser;
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const sessionUser = await authenticateSession(req, res);
    if (sessionUser) {
      req.user = sessionUser;
      return next();
    }
    const token = req.headers.authorization?.replace(/^Bearer /, "");
    if (!token) return res.status(401).json({ error: "Authentication required" });
    const localUser = await authenticateLocalToken(token);
    if (localUser) {
      req.user = localUser;
      return next();
    }
    if (token.startsWith(localTokenPrefix))
      return res.status(401).json({ error: "Invalid local identity" });
    const googleUser = await authenticateGoogleToken(token);
    if (!googleUser) return res.status(401).json({ error: "Invalid Google identity" });
    req.user = googleUser;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired identity token" });
  }
}

export function requireCompletedProfile(req: Request, res: Response, next: NextFunction) {
  if (!req.user?.username || !req.user.whatsapp)
    return res.status(403).json({ error: "Completá tu registro antes de continuar" });
  next();
}
