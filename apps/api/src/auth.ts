import type { NextFunction, Request, Response } from "express";
import { OAuth2Client } from "google-auth-library";
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

export function localAuthToken(userId: string) {
  return `${localTokenPrefix}${encodeURIComponent(userId)}`;
}

async function authenticateLocalToken(token: string): Promise<AuthUser | null> {
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

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const token = req.headers.authorization?.replace(/^Bearer /, "");
    if (!token) return res.status(401).json({ error: "Authentication required" });
    const localUser = await authenticateLocalToken(token);
    if (localUser) {
      req.user = localUser;
      return next();
    }
    if (token.startsWith(localTokenPrefix))
      return res.status(401).json({ error: "Invalid local identity" });
    if (!config.googleClientId) return res.status(401).json({ error: "Authentication required" });
    const payload = await verifyIdentityToken(token);
    if (!payload?.sub || !payload.email || !payload.name)
      return res.status(401).json({ error: "Invalid Google identity" });
    const id = `usr_${payload.sub}`;
    await db.execute({
      sql: `INSERT INTO users (id, google_sub, email, name, avatar_url) VALUES (?, ?, ?, ?, ?) ON CONFLICT(google_sub) DO UPDATE SET email=excluded.email, name=excluded.name, avatar_url=excluded.avatar_url`,
      args: [id, payload.sub, payload.email, payload.name, payload.picture ?? null],
    });
    const saved = await db.execute({
      sql: `SELECT username,whatsapp FROM users WHERE id=?`,
      args: [id],
    });
    req.user = {
      id,
      email: payload.email,
      name: payload.name,
      avatarUrl: payload.picture ?? null,
      username: saved.rows[0]?.username == null ? null : String(saved.rows[0].username),
      whatsapp: saved.rows[0]?.whatsapp == null ? null : String(saved.rows[0].whatsapp),
    };
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
