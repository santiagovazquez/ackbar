import type { NextFunction, Request, Response } from "express";
import { OAuth2Client } from "google-auth-library";
import { config } from "./config.js";
import { db } from "./db.js";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
}
declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

const google = new OAuth2Client(config.googleClientId);

export async function verifyIdentityToken(token: string) {
  const ticket = await google.verifyIdToken({ idToken: token, audience: config.googleClientId });
  return ticket.getPayload();
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const token = req.headers.authorization?.replace(/^Bearer /, "");
    if (!token || !config.googleClientId)
      return res.status(401).json({ error: "Authentication required" });
    const payload = await verifyIdentityToken(token);
    if (!payload?.sub || !payload.email || !payload.name)
      return res.status(401).json({ error: "Invalid Google identity" });
    const id = `usr_${payload.sub}`;
    await db.execute({
      sql: `INSERT INTO users (id, google_sub, email, name, avatar_url) VALUES (?, ?, ?, ?, ?) ON CONFLICT(google_sub) DO UPDATE SET email=excluded.email, name=excluded.name, avatar_url=excluded.avatar_url`,
      args: [id, payload.sub, payload.email, payload.name, payload.picture ?? null],
    });
    req.user = { id, email: payload.email, name: payload.name, avatarUrl: payload.picture ?? null };
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired identity token" });
  }
}
