import { type NextFunction, type Request, type Response } from "express";

import { type AppRole, verifyAuthToken } from "../auth.js";

declare module "express-serve-static-core" {
  interface Request {
    auth?: {
      userId: string;
      role: AppRole;
      email: string;
      playerId?: string;
    };
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.header("authorization");
  if (!header || !header.startsWith("Bearer ")) {
    next(new Error("UNAUTHORIZED"));
    return;
  }

  const token = header.slice("Bearer ".length).trim();

  try {
    const payload = verifyAuthToken(token);
    req.auth = payload;
    next();
  } catch {
    next(new Error("UNAUTHORIZED"));
  }
}

export function requireRole(roles: AppRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.auth) {
      next(new Error("UNAUTHORIZED"));
      return;
    }

    if (!roles.includes(req.auth.role) && !(req.auth.role === "SUPER_ADMIN" && roles.includes("ADMIN"))) {
      next(new Error("FORBIDDEN"));
      return;
    }

    next();
  };
}
