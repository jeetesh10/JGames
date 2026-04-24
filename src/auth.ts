import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

import { config } from "./config.js";

export type AppRole = "ADMIN" | "PLAYER";

export interface AuthTokenPayload {
  userId: string;
  role: AppRole;
  playerId?: string;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function signAuthToken(payload: AuthTokenPayload): string {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: "7d" });
}

export function verifyAuthToken(token: string): AuthTokenPayload {
  const decoded = jwt.verify(token, config.jwtSecret);
  if (typeof decoded !== "object" || decoded === null) {
    throw new Error("Invalid token payload");
  }

  const cast = decoded as Partial<AuthTokenPayload>;
  if (!cast.userId || !cast.role) {
    throw new Error("Invalid token payload");
  }

  return {
    userId: cast.userId,
    role: cast.role,
    playerId: cast.playerId
  };
}
