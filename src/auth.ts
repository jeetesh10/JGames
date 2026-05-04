import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

import { config } from "./config.js";

export type AppRole = "ADMIN" | "PLAYER" | "SUPER_ADMIN";

export interface AuthTokenPayload {
  userId: string;
  role: AppRole;
  email: string;
  playerId?: string;
}

export interface JoinSessionPayload {
  eventGameId: string;
  joinToken: string;
  playerId: string;
  email: string;
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
  if (!cast.userId || !cast.role || !cast.email) {
    throw new Error("Invalid token payload");
  }

  return {
    userId: cast.userId,
    role: cast.role,
    email: cast.email,
    playerId: cast.playerId
  };
}

export function signJoinSessionToken(payload: JoinSessionPayload): string {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: "12h" });
}

export function verifyJoinSessionToken(token: string): JoinSessionPayload {
  const decoded = jwt.verify(token, config.jwtSecret);
  if (typeof decoded !== "object" || decoded === null) {
    throw new Error("Invalid join session token payload");
  }

  const cast = decoded as Partial<JoinSessionPayload>;
  if (!cast.eventGameId || !cast.joinToken || !cast.playerId || !cast.email) {
    throw new Error("Invalid join session token payload");
  }

  return {
    eventGameId: cast.eventGameId,
    joinToken: cast.joinToken,
    playerId: cast.playerId,
    email: cast.email
  };
}
