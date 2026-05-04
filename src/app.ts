import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import helmet from "helmet";
import morgan from "morgan";
import { customAlphabet } from "nanoid";
import QRCode from "qrcode";
import { z } from "zod";

import { hashPassword, signAuthToken, signJoinSessionToken, verifyJoinSessionToken, verifyPassword } from "./auth.js";
import { config } from "./config.js";
import { requireAuth, requireRole } from "./middleware/auth.js";
import { EventGameModel } from "./models/EventGame.js";
import { EventModel } from "./models/Event.js";
import { GameModel } from "./models/Game.js";
import { LocationModel } from "./models/Location.js";
import { ParticipationModel } from "./models/Participation.js";
import { PlayerModel } from "./models/Player.js";
import { ScoreEntryModel } from "./models/ScoreEntry.js";
import { UserModel } from "./models/User.js";
import { runStressScenario } from "./utils/stressScenario.js";
import { asObjectId } from "./utils/objectId.js";

const joinTokenGenerator = customAlphabet("ABCDEFGHJKLMNPQRSTUVWXYZ23456789", 10);
const adminTokenGenerator = customAlphabet("ABCDEFGHJKLMNPQRSTUVWXYZ23456789", 16);
const eventCodeGenerator = customAlphabet("ABCDEFGHJKLMNPQRSTUVWXYZ23456789", 8);
const frontendDistPath = join(dirname(fileURLToPath(import.meta.url)), "..", "web", "dist");
const PETSMART_EMAIL_DOMAIN = "@petsmart.com";

const createEventSchema = z.object({
  name: z.string().min(2),
  eventDate: z.string().min(1).optional(),
  description: z.string().min(2).optional(),
  sponsor: z.string().min(2).optional(),
  code: z.string().min(2).max(20).optional(),
  status: z.enum(["DRAFT", "LIVE", "CLOSED"]).optional(),
  scoringAuthority: z.enum(["ADMIN_ONLY", "PLAYER_SELF", "HYBRID"]).optional(),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional(),
  metadata: z.record(z.string(), z.unknown()).optional()
});

const updateEventSchema = z
  .object({
    name: z.string().min(2).optional(),
    code: z.string().min(2).max(20).optional(),
    eventDate: z.string().min(1).optional(),
    description: z.string().min(2).optional(),
    sponsor: z.string().min(2).optional(),
    status: z.enum(["DRAFT", "LIVE", "CLOSED"]).optional(),
    scoringAuthority: z.enum(["ADMIN_ONLY", "PLAYER_SELF", "HYBRID"]).optional(),
    startsAt: z.string().datetime().nullable().optional(),
    endsAt: z.string().datetime().nullable().optional()
  })
  .strict();

const createLocationSchema = z.object({
  name: z.string().min(2),
  code: z.string().min(2).max(20).optional(),
  venue: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional()
});

const updateLocationSchema = z
  .object({
    name: z.string().min(2).optional(),
    code: z.string().min(2).max(20).optional(),
    venue: z.string().optional()
  })
  .strict();

const createGameSchema = z.object({
  name: z.string().min(2),
  key: z.string().min(2).max(40),
  scoringMode: z.enum(["INDIVIDUAL", "CUMULATIVE"]).optional(),
  scoreUnit: z.string().optional(),
  rules: z.record(z.string(), z.unknown()).optional()
});

const updateGameSchema = z
  .object({
    name: z.string().min(2).optional(),
    key: z.string().min(2).max(40).optional(),
    scoringMode: z.enum(["INDIVIDUAL", "CUMULATIVE"]).optional(),
    scoreUnit: z.string().optional()
  })
  .strict();

const createEventGameSchema = z.object({
  eventId: z.string(),
  locationId: z.string(),
  gameId: z.string(),
  title: z.string().optional(),
  settings: z
    .object({
      scoringAuthority: z.enum(["ADMIN_ONLY", "PLAYER_SELF", "HYBRID"]).optional(),
      allowNegativeScores: z.boolean().optional(),
      maxEntriesPerPlayer: z.number().int().positive().optional(),
      roundsEnabled: z.boolean().optional(),
      totalRounds: z.number().int().positive().optional(),
      maxPointsPerRound: z.number().positive().optional(),
      roundMaxPoints: z.array(z.number().positive()).optional()
    })
    .optional()
});

const updateEventGameSchema = z
  .object({
    title: z.string().optional(),
    settings: z
      .object({
        scoringAuthority: z.enum(["ADMIN_ONLY", "PLAYER_SELF", "HYBRID"]).nullable().optional(),
        allowNegativeScores: z.boolean().optional(),
        maxEntriesPerPlayer: z.number().int().positive().nullable().optional(),
        roundsEnabled: z.boolean().optional(),
        totalRounds: z.number().int().positive().nullable().optional(),
        maxPointsPerRound: z.number().positive().nullable().optional(),
        roundMaxPoints: z.array(z.number().positive()).nullable().optional()
      })
      .optional()
  })
  .strict();

const joinSchema = z.object({
  displayName: z.string().min(2),
  email: z
    .string()
    .email()
    .refine((value) => value.toLowerCase().endsWith(PETSMART_EMAIL_DOMAIN), "Email must be a valid petsmart.com address"),
  externalId: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional()
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6)
});

const playerRegisterSchema = z
  .object({
    email: z
      .string()
      .email()
      .refine((value) => value.toLowerCase().endsWith(PETSMART_EMAIL_DOMAIN), "Email must be a valid petsmart.com address"),
    password: z.string().min(8),
    playerId: z.string().optional()
  })
  .strict();

const scoreSchema = z.object({
  eventGameId: z.string(),
  playerId: z.string(),
  points: z.number(),
  roundNumber: z.number().int().positive().optional(),
  source: z.enum(["MANUAL", "AUTO", "SELF"]).optional()
});

const joinScoreSchema = z.object({
  points: z.number(),
  roundNumber: z.number().int().positive().optional()
});

const createAdminUserSchema = z
  .object({
    email: z.string().email(),
    password: z.string().min(8)
  })
  .strict();

const updateAdminUserSchema = z
  .object({
    email: z.string().email().optional(),
    password: z.string().min(8).optional()
  })
  .strict();

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(8)
  })
  .strict();

type ScoreActorContext = {
  actorType: "ADMIN" | "GAME_ADMIN" | "PLAYER";
  playerId?: string;
};

type JoinSessionState = {
  playerId: string;
  eventGameId: string;
  entries: number;
  totalPoints: number;
  completedRounds: number[];
  nextRoundNumber: number | null;
  isComplete: boolean;
};

const stressScenarioSchema = z
  .object({
    eventCount: z.number().int().min(1).max(20).optional(),
    gamesPerEvent: z.number().int().min(1).max(20).optional(),
    sharedGameCount: z.number().int().min(0).max(20).optional(),
    locationCount: z.number().int().min(1).max(50).optional(),
    playerCount: z.number().int().min(1).max(2000).optional(),
    concurrency: z.number().int().min(1).max(500).optional(),
    maxScore: z.number().int().min(1).max(1000).optional()
  })
  .strict();

function parseOrThrow<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    const message = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join(", ");
    throw new AppError(400, `Validation failed: ${message}`);
  }
  return parsed.data;
}

class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string
  ) {
    super(message);
  }
}

function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<void>
): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    handler(req, res, next).catch(next);
  };
}

function routeParam(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value;
}

function joinSessionTokenFromRequest(req: Request): string | null {
  const headerToken = req.header("x-join-session-token");
  if (headerToken && headerToken.trim()) {
    return headerToken.trim();
  }

  return null;
}

function gameAdminTokenFromRequest(req: Request): string | null {
  const queryToken = req.query.adminToken;
  if (typeof queryToken === "string" && queryToken.trim()) {
    return queryToken.trim();
  }

  const headerToken = req.header("x-game-admin-token");
  if (headerToken && headerToken.trim()) {
    return headerToken.trim();
  }

  return null;
}

function assertRoundSettings(params: {
  roundsEnabled?: boolean;
  totalRounds?: number | null;
  roundMaxPoints?: number[] | null;
}): void {
  const { roundsEnabled, totalRounds, roundMaxPoints } = params;

  if (!roundMaxPoints || roundMaxPoints.length === 0) {
    return;
  }

  if (!roundsEnabled) {
    throw new AppError(400, "roundMaxPoints can only be set when rounds are enabled");
  }

  if (totalRounds && roundMaxPoints.length !== totalRounds) {
    throw new AppError(400, "roundMaxPoints count must match totalRounds");
  }
}

function assertSuperAdminUser(req: Request): void {
  if (!req.auth || req.auth.role !== "SUPER_ADMIN") {
    throw new AppError(403, "Super admin access required");
  }

  if (req.auth.email.toLowerCase() !== config.superAdminEmail) {
    throw new AppError(403, "Only the designated super admin can manage admin users");
  }
}

function isLoopbackHost(hostname: string): boolean {
  const value = hostname.toLowerCase();
  return value === "localhost" || value === "127.0.0.1" || value === "::1";
}

function normalizeOrigin(candidate: string | undefined): string | null {
  if (!candidate) {
    return null;
  }

  try {
    return new URL(candidate).origin;
  } catch {
    return null;
  }
}

function resolveAppBaseUrl(req: Request): string {
  const configured = config.publicBaseUrl;
  const configuredOrigin = normalizeOrigin(configured) ?? configured.replace(/\/+$/, "");
  const originHeader = req.header("origin");
  const refererHeader = req.header("referer");
  const forwardedProto = req.header("x-forwarded-proto")?.split(",")[0]?.trim();
  const forwardedHost = req.header("x-forwarded-host")?.split(",")[0]?.trim();
  const hostHeader = req.header("host");

  const candidates = [
    normalizeOrigin(originHeader),
    normalizeOrigin(refererHeader),
    normalizeOrigin(
      forwardedProto && forwardedHost
        ? `${forwardedProto}://${forwardedHost}`
        : undefined
    ),
    normalizeOrigin(hostHeader ? `${req.protocol}://${hostHeader}` : undefined),
  ].filter((value): value is string => Boolean(value));

  for (const candidate of candidates) {
    try {
      const candidateUrl = new URL(candidate);
      const configuredUrl = new URL(configuredOrigin);

      if (isLoopbackHost(candidateUrl.hostname) && !isLoopbackHost(configuredUrl.hostname)) {
        return configuredUrl.origin;
      }

      return candidateUrl.origin;
    } catch {
      // Try the next candidate.
    }
  }

  return configuredOrigin;
}

function extractSvgSize(svg: string): { width: number; height: number } {
  const viewBoxMatch = svg.match(/viewBox="(?:[\d.]+\s+){2}([\d.]+)\s+([\d.]+)"/i);
  if (viewBoxMatch) {
    const width = Number(viewBoxMatch[1]);
    const height = Number(viewBoxMatch[2]);
    if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
      return { width, height };
    }
  }

  const widthMatch = svg.match(/width="([\d.]+)"/i);
  const heightMatch = svg.match(/height="([\d.]+)"/i);
  const width = widthMatch ? Number(widthMatch[1]) : 37;
  const height = heightMatch ? Number(heightMatch[1]) : 37;

  return {
    width: Number.isFinite(width) && width > 0 ? width : 37,
    height: Number.isFinite(height) && height > 0 ? height : 37
  };
}

async function createBrandedQrDataUrl(url: string): Promise<string> {
  const svgRaw = await QRCode.toString(url, {
    type: "svg",
    errorCorrectionLevel: "H",
    margin: 4,
    width: 1024,
    color: {
      dark: "#000000",
      light: "#FFFFFF"
    }
  });

  const svg = svgRaw.replace("<svg ", "<svg shape-rendering=\"crispEdges\" ");

  const { width, height } = extractSvgSize(svg);
  const badgeSize = Math.min(width, height) * 0.1;
  const badgePadding = badgeSize * 0.22;
  const badgeTotalSize = badgeSize + badgePadding * 2;
  const badgeX = (width - badgeTotalSize) / 2;
  const badgeY = (height - badgeTotalSize) / 2;
  const badgeTextX = width / 2;
  const badgeTextY = height / 2;

  const brandedSvg = svg.replace(
    "</svg>",
    `<g id="brand"><rect x="${badgeX}" y="${badgeY}" width="${badgeTotalSize}" height="${badgeTotalSize}" rx="${badgeTotalSize * 0.15}" ry="${badgeTotalSize * 0.15}" fill="#FFFFFF"/><text x="${badgeTextX}" y="${badgeTextY}" text-anchor="middle" dominant-baseline="middle" font-family="Arial, Helvetica, sans-serif" font-size="${badgeSize * 0.56}" font-weight="700" fill="#E31837">JB</text></g></svg>`
  );

  return `data:image/svg+xml;base64,${Buffer.from(brandedSvg).toString("base64")}`;
}

async function buildEventGameParticipantsPayload(eventGameId: ReturnType<typeof asObjectId>) {
  const eventGame = await EventGameModel.findById(eventGameId).lean();

  if (!eventGame) {
    throw new AppError(404, "Event game not found");
  }

  const [event, location, game, participations, scoreSummary] = await Promise.all([
    EventModel.findById(eventGame.eventId).lean(),
    LocationModel.findById(eventGame.locationId).lean(),
    GameModel.findById(eventGame.gameId).lean(),
    ParticipationModel.find({ eventGameId }).sort({ createdAt: -1 }).lean(),
    ScoreEntryModel.aggregate<{
      _id: unknown;
      totalPoints: number;
      entries: number;
      lastScoredAt?: Date;
    }>([
      { $match: { eventGameId } },
      {
        $group: {
          _id: "$playerId",
          totalPoints: { $sum: "$points" },
          entries: { $sum: 1 },
          lastScoredAt: { $max: "$createdAt" }
        }
      }
    ])
  ]);

  const playerIds = participations.map((item) => item.playerId);
  const players = await PlayerModel.find({ _id: { $in: playerIds } }).lean();

  const playersById = new Map(players.map((item) => [String(item._id), item]));
  const scoreByPlayerId = new Map(
    scoreSummary.map((item) => [String(item._id), item] as const)
  );

  const participants = participations
    .map((item) => {
      const playerId = String(item.playerId);
      const player = playersById.get(playerId);
      if (!player) {
        return null;
      }

      const score = scoreByPlayerId.get(playerId);

      return {
        playerId,
        displayName: player.displayName,
        email: player.email,
        joinedAt: item.createdAt,
        totalPoints: score?.totalPoints ?? 0,
        entries: score?.entries ?? 0,
        lastScoredAt: score?.lastScoredAt
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  return {
    eventGame: {
      _id: String(eventGame._id),
      title: eventGame.title,
      joinToken: eventGame.joinToken,
      event: event ? { _id: String(event._id), name: event.name } : null,
      location: location ? { _id: String(location._id), name: location.name } : null,
      game: game ? { _id: String(game._id), name: game.name, scoreUnit: game.scoreUnit } : null
    },
    participants
  };
}

async function createScoreEntryForEventGame(payload: z.infer<typeof scoreSchema>, actor: ScoreActorContext) {
  const eventGameId = asObjectId(payload.eventGameId);
  const playerId = asObjectId(payload.playerId);

  const [eventGame, participation] = await Promise.all([
    EventGameModel.findById(eventGameId),
    ParticipationModel.findOne({ eventGameId, playerId })
  ]);

  if (!eventGame) {
    throw new AppError(404, "Event game not found");
  }

  const event = await EventModel.findById(eventGame.eventId).lean();
  if (!event) {
    throw new AppError(404, "Event not found");
  }

  const scoringAuthority = eventGame.settings?.scoringAuthority ?? event.scoringAuthority ?? "ADMIN_ONLY";

  if (actor.actorType === "PLAYER") {
    if (!actor.playerId || actor.playerId !== payload.playerId) {
      throw new AppError(403, "Players can only submit scores for themselves");
    }
  }

  if (scoringAuthority === "ADMIN_ONLY" && actor.actorType === "PLAYER") {
    throw new AppError(403, "This event allows score submission by admins only");
  }

  if (scoringAuthority === "PLAYER_SELF" && actor.actorType !== "PLAYER") {
    throw new AppError(403, "This event allows score submission by players only");
  }

  if (!participation) {
    throw new AppError(409, "Player must join this game before score submission");
  }

  const allowNegative = eventGame.settings?.allowNegativeScores ?? false;
  if (!allowNegative && payload.points < 0) {
    throw new AppError(400, "Negative scores are not allowed for this game");
  }

  const roundsEnabled = eventGame.settings?.roundsEnabled ?? false;
  const totalRounds = eventGame.settings?.totalRounds;
  const maxPointsPerRound = eventGame.settings?.maxPointsPerRound;
  const roundMaxPoints = eventGame.settings?.roundMaxPoints;

  if (roundsEnabled) {
    if (!payload.roundNumber) {
      throw new AppError(400, "roundNumber is required for multi-round games");
    }

    if (totalRounds && payload.roundNumber > totalRounds) {
      throw new AppError(400, `roundNumber cannot exceed configured total rounds (${totalRounds})`);
    }

    const alreadyScoredRound = await ScoreEntryModel.exists({
      eventGameId,
      playerId,
      roundNumber: payload.roundNumber
    });
    if (alreadyScoredRound) {
      throw new AppError(409, `Score already submitted for round ${payload.roundNumber}`);
    }
  } else if (payload.roundNumber !== undefined) {
    throw new AppError(400, "roundNumber is only allowed for games configured with rounds");
  }

  if (roundsEnabled && payload.roundNumber && Array.isArray(roundMaxPoints) && roundMaxPoints.length > 0) {
    const maxPointsForRound = roundMaxPoints[payload.roundNumber - 1];
    if (typeof maxPointsForRound === "number" && payload.points > maxPointsForRound) {
      throw new AppError(400, `points cannot exceed configured max for round ${payload.roundNumber} (${maxPointsForRound})`);
    }
  } else if (maxPointsPerRound != null && payload.points > maxPointsPerRound) {
    throw new AppError(400, `points cannot exceed configured maxPointsPerRound (${maxPointsPerRound})`);
  }

  const configuredMaxEntries = eventGame.settings?.maxEntriesPerPlayer;
  const effectiveMaxEntries =
    configuredMaxEntries
    ?? (actor.actorType === "PLAYER"
      ? roundsEnabled
        ? totalRounds ?? undefined
        : 1
      : undefined);

  if (effectiveMaxEntries) {
    const currentEntries = await ScoreEntryModel.countDocuments({ eventGameId, playerId });
    if (currentEntries >= effectiveMaxEntries) {
      throw new AppError(409, "Maximum score entries reached for player in this game");
    }
  }

  const score = await ScoreEntryModel.create({
    eventId: eventGame.eventId,
    locationId: eventGame.locationId,
    eventGameId: eventGame._id,
    gameId: eventGame.gameId,
    playerId,
    points: payload.points,
    roundNumber: payload.roundNumber,
    source: actor.actorType === "PLAYER" ? "SELF" : (payload.source ?? "MANUAL")
  });

  return score;
}

async function buildJoinSessionState(joinToken: string, playerId: string): Promise<JoinSessionState> {
  const eventGame = await EventGameModel.findOne({ joinToken }).lean();
  if (!eventGame) {
    throw new AppError(404, "Join token not found");
  }

  const playerObjectId = asObjectId(playerId);
  const scores = await ScoreEntryModel.find({
    eventGameId: eventGame._id,
    playerId: playerObjectId
  })
    .sort({ roundNumber: 1, createdAt: 1 })
    .lean();

  const completedRounds = scores
    .map((score) => score.roundNumber)
    .filter((roundNumber): roundNumber is number => typeof roundNumber === "number")
    .sort((left, right) => left - right);

  const totalPoints = scores.reduce((sum, score) => sum + score.points, 0);
  const roundsEnabled = eventGame.settings?.roundsEnabled ?? false;
  const totalRounds = eventGame.settings?.totalRounds;
  const effectiveMaxEntries = eventGame.settings?.maxEntriesPerPlayer ?? (roundsEnabled ? totalRounds ?? undefined : 1);
  const nextRoundNumber = roundsEnabled
    ? (() => {
        if (totalRounds) {
          for (let round = 1; round <= totalRounds; round += 1) {
            if (!completedRounds.includes(round)) {
              return round;
            }
          }
          return null;
        }

        return completedRounds.length + 1;
      })()
    : scores.length === 0
      ? 1
      : null;

  const isComplete = effectiveMaxEntries != null
    ? scores.length >= effectiveMaxEntries
    : (roundsEnabled && totalRounds != null ? completedRounds.length >= totalRounds : false);

  return {
    playerId,
    eventGameId: String(eventGame._id),
    entries: scores.length,
    totalPoints,
    completedRounds,
    nextRoundNumber,
    isComplete
  };
}

const app = express();
app.use(helmet());
app.use(cors());
app.use(morgan("dev"));
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "jgames-api" });
});

app.post(
  "/api/auth/login",
  asyncHandler(async (req, res) => {
    const payload = parseOrThrow(loginSchema, req.body);
    const user = await UserModel.findOne({ email: payload.email.toLowerCase() });

    if (!user) {
      throw new AppError(401, "Invalid credentials");
    }

    const ok = await verifyPassword(payload.password, user.passwordHash);
    if (!ok) {
      throw new AppError(401, "Invalid credentials");
    }

    const token = signAuthToken({
      userId: String(user._id),
      role: user.role,
      email: user.email,
      playerId: user.playerId ? String(user.playerId) : undefined
    });

    res.json({
      token,
      role: user.role,
      playerId: user.playerId
    });
  })
);

app.post(
  "/api/auth/player/register",
  asyncHandler(async (req, res) => {
    const payload = parseOrThrow(playerRegisterSchema, req.body);

    const existingUser = await UserModel.findOne({ email: payload.email.toLowerCase() });
    if (existingUser) {
      throw new AppError(409, "User already exists");
    }

    let playerId = payload.playerId ? asObjectId(payload.playerId) : null;

    if (!playerId) {
      const player = await PlayerModel.findOne({ email: payload.email.toLowerCase() });
      if (!player) {
        throw new AppError(404, "No player profile found. Join a game first or provide playerId.");
      }
      playerId = player._id;
    }

    const linkedUser = await UserModel.findOne({ playerId });
    if (linkedUser) {
      throw new AppError(409, "This player profile is already linked to another account");
    }

    const passwordHash = await hashPassword(payload.password);
    const user = await UserModel.create({
      email: payload.email.toLowerCase(),
      passwordHash,
      role: "PLAYER",
      playerId
    });

    const token = signAuthToken({
      userId: String(user._id),
      role: "PLAYER",
      email: user.email,
      playerId: String(playerId)
    });

    res.status(201).json({
      token,
      role: "PLAYER",
      playerId
    });
  })
);

app.post(
  "/api/events",
  requireAuth,
  requireRole(["ADMIN"]),
  asyncHandler(async (req, res) => {
    const payload = parseOrThrow(createEventSchema, req.body);
    const eventDate = payload.eventDate ?? new Date().toISOString().slice(0, 10);
    const description = payload.description?.trim() || payload.name.trim();
    const created = await EventModel.create({
      ...payload,
      eventDate,
      description,
      code: (payload.code?.toUpperCase().trim() ?? eventCodeGenerator()),
      startsAt: payload.startsAt ? new Date(payload.startsAt) : undefined,
      endsAt: payload.endsAt ? new Date(payload.endsAt) : undefined
    });
    res.status(201).json(created);
  })
);

app.post(
  "/api/admin/users",
  requireAuth,
  requireRole(["SUPER_ADMIN"]),
  asyncHandler(async (req, res) => {
    assertSuperAdminUser(req);
    const payload = parseOrThrow(createAdminUserSchema, req.body);
    const normalizedEmail = payload.email.toLowerCase().trim();

    const existingUser = await UserModel.findOne({ email: normalizedEmail });
    if (existingUser) {
      throw new AppError(409, "User already exists");
    }

    const passwordHash = await hashPassword(payload.password);
    const created = await UserModel.create({
      email: normalizedEmail,
      passwordHash,
      role: "ADMIN"
    });

    res.status(201).json({
      userId: String(created._id),
      email: created.email,
      role: created.role
    });
  })
);

app.get(
  "/api/admin/users",
  requireAuth,
  requireRole(["SUPER_ADMIN"]),
  asyncHandler(async (req, res) => {
    assertSuperAdminUser(req);

    const users = await UserModel.find({ role: "ADMIN" })
      .sort({ createdAt: -1 })
      .select({ _id: 1, email: 1, role: 1, createdAt: 1, updatedAt: 1 })
      .lean();

    res.json(
      users.map((user) => ({
        userId: String(user._id),
        email: user.email,
        role: user.role,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      }))
    );
  })
);

app.patch(
  "/api/admin/users/:userId",
  requireAuth,
  requireRole(["SUPER_ADMIN"]),
  asyncHandler(async (req, res) => {
    assertSuperAdminUser(req);
    const userId = asObjectId(routeParam(req.params.userId));
    const payload = parseOrThrow(updateAdminUserSchema, req.body);

    if (Object.keys(payload).length === 0) {
      throw new AppError(400, "No fields provided for update");
    }

    const user = await UserModel.findOne({ _id: userId, role: "ADMIN" });
    if (!user) {
      throw new AppError(404, "Admin user not found");
    }

    if (payload.email) {
      const normalizedEmail = payload.email.toLowerCase().trim();
      const existingUser = await UserModel.findOne({ email: normalizedEmail, _id: { $ne: userId } }).lean();
      if (existingUser) {
        throw new AppError(409, "User already exists");
      }
      user.email = normalizedEmail;
    }

    if (payload.password) {
      user.passwordHash = await hashPassword(payload.password);
    }

    await user.save();

    res.json({
      userId: String(user._id),
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    });
  })
);

app.post(
  "/api/auth/change-password",
  requireAuth,
  requireRole(["SUPER_ADMIN"]),
  asyncHandler(async (req, res) => {
    assertSuperAdminUser(req);
    const payload = parseOrThrow(changePasswordSchema, req.body);

    const currentUser = await UserModel.findById(req.auth?.userId);
    if (!currentUser) {
      throw new AppError(404, "User not found");
    }

    const ok = await verifyPassword(payload.currentPassword, currentUser.passwordHash);
    if (!ok) {
      throw new AppError(401, "Current password is incorrect");
    }

    currentUser.passwordHash = await hashPassword(payload.newPassword);
    await currentUser.save();

    res.json({ message: "Password updated" });
  })
);

app.get(
  "/api/events",
  requireAuth,
  requireRole(["ADMIN"]),
  asyncHandler(async (_req, res) => {
    const events = await EventModel.find().sort({ createdAt: -1 }).lean();
    res.json(events);
  })
);

app.patch(
  "/api/events/:eventId",
  requireAuth,
  requireRole(["ADMIN"]),
  asyncHandler(async (req, res) => {
    const eventId = asObjectId(routeParam(req.params.eventId));
    const payload = parseOrThrow(updateEventSchema, req.body);

    if (Object.keys(payload).length === 0) {
      throw new AppError(400, "No fields provided for update");
    }

    const updated = await EventModel.findByIdAndUpdate(
      eventId,
      {
        ...payload,
        code: payload.code?.toUpperCase(),
        sponsor: payload.sponsor?.trim(),
        startsAt: payload.startsAt === null ? null : payload.startsAt ? new Date(payload.startsAt) : undefined,
        endsAt: payload.endsAt === null ? null : payload.endsAt ? new Date(payload.endsAt) : undefined
      },
      { new: true, runValidators: true }
    ).lean();

    if (!updated) {
      throw new AppError(404, "Event not found");
    }

    res.json(updated);
  })
);

app.post(
  "/api/events/:eventId/locations",
  requireAuth,
  requireRole(["ADMIN"]),
  asyncHandler(async (req, res) => {
    const eventId = asObjectId(routeParam(req.params.eventId));
    const payload = parseOrThrow(createLocationSchema, req.body);

    const eventExists = await EventModel.exists({ _id: eventId });
    if (!eventExists) {
      throw new AppError(404, "Event not found");
    }

    const created = await LocationModel.create({
      ...payload,
      eventId
    });
    res.status(201).json(created);
  })
);

app.get(
  "/api/events/:eventId/locations",
  requireAuth,
  requireRole(["ADMIN"]),
  asyncHandler(async (req, res) => {
    const eventId = asObjectId(routeParam(req.params.eventId));
    const locations = await LocationModel.find({ eventId }).sort({ createdAt: -1 }).lean();
    res.json(locations);
  })
);

app.get(
  "/api/locations",
  requireAuth,
  requireRole(["ADMIN"]),
  asyncHandler(async (_req, res) => {
    const locations = await LocationModel.find().sort({ createdAt: -1 }).lean();
    res.json(locations);
  })
);

app.patch(
  "/api/events/:eventId/locations/:locationId",
  requireAuth,
  requireRole(["ADMIN"]),
  asyncHandler(async (req, res) => {
    const eventId = asObjectId(routeParam(req.params.eventId));
    const locationId = asObjectId(routeParam(req.params.locationId));
    const payload = parseOrThrow(updateLocationSchema, req.body);

    if (Object.keys(payload).length === 0) {
      throw new AppError(400, "No fields provided for update");
    }

    const updated = await LocationModel.findOneAndUpdate(
      { _id: locationId, eventId },
      payload,
      { new: true, runValidators: true }
    ).lean();

    if (!updated) {
      throw new AppError(404, "Location not found for event");
    }

    res.json(updated);
  })
);

app.post(
  "/api/games",
  requireAuth,
  requireRole(["ADMIN"]),
  asyncHandler(async (req, res) => {
    const payload = parseOrThrow(createGameSchema, req.body);
    let created;
    try {
      created = await GameModel.create(payload);
    } catch (error: unknown) {
      const isDuplicateKey =
        typeof error === "object"
        && error !== null
        && "code" in error
        && (error as { code?: number }).code === 11000;

      if (isDuplicateKey) {
        throw new AppError(409, "A game with this key already exists. Use a different name or select an existing game.");
      }

      throw error;
    }

    res.status(201).json(created);
  })
);

app.get(
  "/api/games",
  requireAuth,
  requireRole(["ADMIN"]),
  asyncHandler(async (_req, res) => {
    const games = await GameModel.find().sort({ createdAt: -1 }).lean();
    res.json(games);
  })
);

app.patch(
  "/api/games/:gameId",
  requireAuth,
  requireRole(["ADMIN"]),
  asyncHandler(async (req, res) => {
    const gameId = asObjectId(routeParam(req.params.gameId));
    const payload = parseOrThrow(updateGameSchema, req.body);

    if (Object.keys(payload).length === 0) {
      throw new AppError(400, "No fields provided for update");
    }

    const updated = await GameModel.findByIdAndUpdate(
      gameId,
      {
        ...payload,
        key: payload.key?.toLowerCase()
      },
      { new: true, runValidators: true }
    ).lean();

    if (!updated) {
      throw new AppError(404, "Game not found");
    }

    res.json(updated);
  })
);

app.post(
  "/api/event-games",
  requireAuth,
  requireRole(["ADMIN"]),
  asyncHandler(async (req, res) => {
    const payload = parseOrThrow(createEventGameSchema, req.body);
    assertRoundSettings({
      roundsEnabled: payload.settings?.roundsEnabled,
      totalRounds: payload.settings?.totalRounds,
      roundMaxPoints: payload.settings?.roundMaxPoints
    });

    const eventId = asObjectId(payload.eventId);
    const locationId = asObjectId(payload.locationId);
    const gameId = asObjectId(payload.gameId);

    const [event, location, game] = await Promise.all([
      EventModel.exists({ _id: eventId }),
      LocationModel.exists({ _id: locationId, eventId }),
      GameModel.exists({ _id: gameId })
    ]);

    if (!event) {
      throw new AppError(404, "Event not found");
    }
    if (!location) {
      throw new AppError(404, "Location not found for event");
    }
    if (!game) {
      throw new AppError(404, "Game not found");
    }

    const created = await EventGameModel.create({
      eventId,
      locationId,
      gameId,
      title: payload.title,
      settings: payload.settings,
      joinToken: joinTokenGenerator(),
      adminToken: adminTokenGenerator()
    });

    res.status(201).json(created);
  })
);

app.get(
  "/api/event-games",
  requireAuth,
  requireRole(["ADMIN"]),
  asyncHandler(async (req, res) => {
    const eventIdRaw = req.query.eventId;
    const gameIdRaw = req.query.gameId;
    const locationIdRaw = req.query.locationId;

    const query: {
      eventId?: ReturnType<typeof asObjectId>;
      gameId?: ReturnType<typeof asObjectId>;
      locationId?: ReturnType<typeof asObjectId>;
    } = {};

    if (typeof eventIdRaw === "string") query.eventId = asObjectId(eventIdRaw);
    if (typeof gameIdRaw === "string") query.gameId = asObjectId(gameIdRaw);
    if (typeof locationIdRaw === "string") query.locationId = asObjectId(locationIdRaw);

    const eventGames = await EventGameModel.find(query).sort({ createdAt: -1 }).lean();
    res.json(eventGames);
  })
);

app.patch(
  "/api/event-games/:eventGameId",
  requireAuth,
  requireRole(["ADMIN"]),
  asyncHandler(async (req, res) => {
    const eventGameId = asObjectId(routeParam(req.params.eventGameId));
    const payload = parseOrThrow(updateEventGameSchema, req.body);

    if (Object.keys(payload).length === 0) {
      throw new AppError(400, "No fields provided for update");
    }

    const updates: {
      title?: string;
      settings?: {
        scoringAuthority?: "ADMIN_ONLY" | "PLAYER_SELF" | "HYBRID" | null;
        allowNegativeScores?: boolean;
        maxEntriesPerPlayer?: number | null;
        roundsEnabled?: boolean;
        totalRounds?: number | null;
        maxPointsPerRound?: number | null;
        roundMaxPoints?: number[] | null;
      };
    } = {};

    if (typeof payload.title === "string") {
      updates.title = payload.title;
    }

    if (payload.settings) {
      assertRoundSettings({
        roundsEnabled: payload.settings.roundsEnabled,
        totalRounds: payload.settings.totalRounds,
        roundMaxPoints: payload.settings.roundMaxPoints
      });

      updates.settings = {
        scoringAuthority: payload.settings.scoringAuthority ?? null,
        allowNegativeScores: payload.settings.allowNegativeScores,
        maxEntriesPerPlayer: payload.settings.maxEntriesPerPlayer ?? null,
        roundsEnabled: payload.settings.roundsEnabled,
        totalRounds: payload.settings.totalRounds ?? null,
        maxPointsPerRound: payload.settings.maxPointsPerRound ?? null,
        roundMaxPoints: payload.settings.roundMaxPoints ?? null
      };
    }

    const updated = await EventGameModel.findByIdAndUpdate(eventGameId, updates, {
      new: true,
      runValidators: true
    }).lean();

    if (!updated) {
      throw new AppError(404, "Event game not found");
    }

    res.json(updated);
  })
);

app.get(
  "/api/event-games/:eventGameId/join-link",
  requireAuth,
  requireRole(["ADMIN"]),
  asyncHandler(async (req, res) => {
    const eventGameId = asObjectId(routeParam(req.params.eventGameId));
    const eventGame = await EventGameModel.findById(eventGameId).lean();

    if (!eventGame) {
      throw new AppError(404, "Event game not found");
    }

    const event = await EventModel.findById(eventGame.eventId).lean();
    const scoringAuthority = eventGame.settings?.scoringAuthority ?? event?.scoringAuthority ?? "ADMIN_ONLY";
    const includeAdminQr = scoringAuthority !== "PLAYER_SELF";

    let adminToken: string | undefined;
    if (includeAdminQr) {
      adminToken = eventGame.adminToken ?? undefined;
      if (!adminToken) {
        adminToken = adminTokenGenerator();
        await EventGameModel.updateOne(
          { _id: eventGameId },
          { $set: { adminToken } }
        );
      }
    }

    const appBaseUrl = resolveAppBaseUrl(req);
    const playerUrl = `${appBaseUrl}/join/${eventGame.joinToken}`;
    const playerQrCodeDataUrl = await createBrandedQrDataUrl(playerUrl);

    let adminUrl: string | undefined;
    let adminQrCodeDataUrl: string | undefined;
    if (includeAdminQr && adminToken) {
      adminUrl = `${appBaseUrl}/game-admin/${eventGameId}?adminToken=${encodeURIComponent(adminToken)}`;
      adminQrCodeDataUrl = await createBrandedQrDataUrl(adminUrl);
    }

    res.json({
      eventGameId,
      joinToken: eventGame.joinToken,
      // Backward-compatible fields kept for older clients.
      joinUrl: playerUrl,
      qrCodeDataUrl: playerQrCodeDataUrl,
      playerUrl,
      playerQrCodeDataUrl,
      ...(adminUrl ? { adminUrl } : {}),
      ...(adminQrCodeDataUrl ? { adminQrCodeDataUrl } : {})
    });
  })
);

app.get(
  "/api/join/:joinToken/meta",
  asyncHandler(async (req, res) => {
    const joinToken = routeParam(req.params.joinToken);
    const eventGame = await EventGameModel.findOne({ joinToken }).lean();

    if (!eventGame) {
      throw new AppError(404, "Join token not found");
    }

    const [event, location, game] = await Promise.all([
      EventModel.findById(eventGame.eventId).lean(),
      LocationModel.findById(eventGame.locationId).lean(),
      GameModel.findById(eventGame.gameId).lean()
    ]);

    res.json({
      eventGame: {
        _id: String(eventGame._id),
        title: eventGame.title,
        joinToken: eventGame.joinToken,
        settings: {
          scoringAuthority: eventGame.settings?.scoringAuthority ?? event?.scoringAuthority ?? "ADMIN_ONLY",
          roundsEnabled: eventGame.settings?.roundsEnabled ?? false,
          totalRounds: eventGame.settings?.totalRounds,
          maxPointsPerRound: eventGame.settings?.maxPointsPerRound,
          roundMaxPoints: eventGame.settings?.roundMaxPoints
        },
        event: event ? { _id: String(event._id), name: event.name } : null,
        location: location ? { _id: String(location._id), name: location.name } : null,
        game: game ? { _id: String(game._id), name: game.name, scoreUnit: game.scoreUnit } : null,
        scoringAuthority: eventGame.settings?.scoringAuthority ?? event?.scoringAuthority ?? "ADMIN_ONLY"
      }
    });
  })
);

app.post(
  "/api/join/:joinToken",
  asyncHandler(async (req, res) => {
    const joinToken = routeParam(req.params.joinToken);
    const payload = parseOrThrow(joinSchema, req.body);

    const eventGame = await EventGameModel.findOne({ joinToken });
    if (!eventGame) {
      throw new AppError(404, "Join token not found");
    }

    let player = null;

    if (payload.email || payload.externalId) {
      const filters = [];
      if (payload.email) filters.push({ email: payload.email.toLowerCase() });
      if (payload.externalId) filters.push({ externalId: payload.externalId });
      player = await PlayerModel.findOne({ $or: filters });
    }

    if (!player) {
      player = await PlayerModel.create({
        displayName: payload.displayName,
        email: payload.email.toLowerCase(),
        externalId: payload.externalId,
        metadata: payload.metadata
      });
    } else {
      player.displayName = payload.displayName;
      player.email = payload.email.toLowerCase();
      if (payload.externalId) player.externalId = payload.externalId;
      if (payload.metadata) player.metadata = payload.metadata;
      await player.save();
    }

    const joinSessionToken = signJoinSessionToken({
      eventGameId: String(eventGame._id),
      joinToken,
      playerId: String(player._id),
      email: payload.email.toLowerCase()
    });

    await ParticipationModel.updateOne(
      {
        eventGameId: eventGame._id,
        playerId: player._id
      },
      {
        $setOnInsert: {
          eventGameId: eventGame._id,
          playerId: player._id
        }
      },
      { upsert: true }
    );

    res.status(201).json({
      message: "Joined successfully",
      eventGameId: eventGame._id,
      playerId: player._id,
      displayName: player.displayName,
      joinSessionToken
    });
  })
);

app.get(
  "/api/join/:joinToken/session-state",
  asyncHandler(async (req, res) => {
    const joinToken = routeParam(req.params.joinToken);
    const joinSessionToken = joinSessionTokenFromRequest(req);

    if (!joinSessionToken) {
      throw new AppError(401, "Join session token is required");
    }

    let joinSession;
    try {
      joinSession = verifyJoinSessionToken(joinSessionToken);
    } catch {
      throw new AppError(401, "Invalid or expired join session token");
    }

    if (joinSession.joinToken !== joinToken) {
      throw new AppError(403, "Join session token does not match this game session");
    }

    const state = await buildJoinSessionState(joinToken, joinSession.playerId);

    if (state.eventGameId !== joinSession.eventGameId) {
      throw new AppError(403, "Join session token does not match this game session");
    }

    res.json(state);
  })
);

app.post(
  "/api/join/:joinToken/scores",
  asyncHandler(async (req, res) => {
    const joinToken = routeParam(req.params.joinToken);
    const payload = parseOrThrow(joinScoreSchema, req.body);
    const joinSessionToken = joinSessionTokenFromRequest(req);

    if (!joinSessionToken) {
      throw new AppError(401, "Join session token is required");
    }

    const eventGame = await EventGameModel.findOne({ joinToken }).lean();
    if (!eventGame) {
      throw new AppError(404, "Join token not found");
    }

    let joinSession;
    try {
      joinSession = verifyJoinSessionToken(joinSessionToken);
    } catch {
      throw new AppError(401, "Invalid or expired join session token");
    }

    if (joinSession.joinToken !== joinToken || joinSession.eventGameId !== String(eventGame._id)) {
      throw new AppError(403, "Join session token does not match this game session");
    }

    const score = await createScoreEntryForEventGame(
      {
        ...payload,
        eventGameId: String(eventGame._id),
        playerId: joinSession.playerId
      },
      {
        actorType: "PLAYER",
        playerId: joinSession.playerId
      }
    );

    res.status(201).json(score);
  })
);

app.get(
  "/api/event-games/:eventGameId/participants",
  requireAuth,
  requireRole(["ADMIN"]),
  asyncHandler(async (req, res) => {
    const eventGameId = asObjectId(routeParam(req.params.eventGameId));
    const payload = await buildEventGameParticipantsPayload(eventGameId);
    res.json(payload);
  })
);

app.get(
  "/api/game-admin/:eventGameId/participants",
  asyncHandler(async (req, res) => {
    const eventGameId = asObjectId(routeParam(req.params.eventGameId));
    const adminToken = gameAdminTokenFromRequest(req);

    if (!adminToken) {
      throw new AppError(401, "Admin token is required");
    }

    const eventGame = await EventGameModel.findById(eventGameId).lean();
    if (!eventGame) {
      throw new AppError(404, "Event game not found");
    }

    if (!eventGame.adminToken || eventGame.adminToken !== adminToken) {
      throw new AppError(403, "Invalid game admin token");
    }

    const payload = await buildEventGameParticipantsPayload(eventGameId);
    res.json(payload);
  })
);

app.post(
  "/api/scores",
  requireAuth,
  requireRole(["ADMIN"]),
  asyncHandler(async (req, res) => {
    const payload = parseOrThrow(scoreSchema, req.body);
    const score = await createScoreEntryForEventGame(payload, { actorType: "ADMIN" });

    res.status(201).json(score);
  })
);

app.post(
  "/api/player/scores",
  requireAuth,
  requireRole(["PLAYER"]),
  asyncHandler(async (req, res) => {
    if (!req.auth?.playerId) {
      throw new AppError(400, "No player profile linked. Register player account first.");
    }

    const payload = parseOrThrow(scoreSchema, req.body);
    const score = await createScoreEntryForEventGame(payload, {
      actorType: "PLAYER",
      playerId: req.auth.playerId
    });

    res.status(201).json(score);
  })
);

app.post(
  "/api/game-admin/scores",
  asyncHandler(async (req, res) => {
    const payload = parseOrThrow(scoreSchema, req.body);
    const eventGameId = asObjectId(payload.eventGameId);
    const adminToken = gameAdminTokenFromRequest(req);

    if (!adminToken) {
      throw new AppError(401, "Admin token is required");
    }

    const eventGame = await EventGameModel.findById(eventGameId).lean();
    if (!eventGame) {
      throw new AppError(404, "Event game not found");
    }

    if (!eventGame.adminToken || eventGame.adminToken !== adminToken) {
      throw new AppError(403, "Invalid game admin token");
    }

    const score = await createScoreEntryForEventGame(payload, { actorType: "GAME_ADMIN" });

    res.status(201).json(score);
  })
);

interface LeaderboardAggregateRow {
  playerId: unknown;
  displayName: string;
  email?: string;
  totalPoints: number;
  entries: number;
  lastScoredAt?: Date;
}

interface LeaderboardEntryView {
  rank: number;
  playerId: string;
  displayName: string;
  email?: string;
  totalPoints: number;
  entries: number;
  lastScoredAt?: string;
}

async function leaderboardByMatch(match: Record<string, unknown>, limit: number): Promise<LeaderboardEntryView[]> {
  const results = await ScoreEntryModel.aggregate<LeaderboardAggregateRow>([
    { $match: match },
    {
      $group: {
        _id: "$playerId",
        totalPoints: { $sum: "$points" },
        entries: { $sum: 1 },
        lastScoredAt: { $max: "$createdAt" }
      }
    },
    {
      $lookup: {
        from: "players",
        localField: "_id",
        foreignField: "_id",
        as: "player"
      }
    },
    { $unwind: "$player" },
    {
      $project: {
        _id: 0,
        playerId: "$_id",
        displayName: "$player.displayName",
        email: "$player.email",
        totalPoints: 1,
        entries: 1,
        lastScoredAt: 1
      }
    },
    {
      $sort: {
        totalPoints: -1,
        lastScoredAt: 1
      }
    },
    { $limit: limit }
  ]);

  return results.map((entry, index) => ({
    rank: index + 1,
    playerId: String(entry.playerId),
    displayName: entry.displayName,
    email: entry.email,
    totalPoints: entry.totalPoints,
    entries: entry.entries,
    lastScoredAt: entry.lastScoredAt instanceof Date ? entry.lastScoredAt.toISOString() : undefined
  }));
}

app.get(
  "/api/public/leaderboards/event/:eventId",
  asyncHandler(async (req, res) => {
    const eventId = asObjectId(routeParam(req.params.eventId));
    const event = await EventModel.findById(eventId).lean();

    if (!event) {
      throw new AppError(404, "Event not found");
    }

    const [locations, eventGames] = await Promise.all([
      LocationModel.find({ eventId }).sort({ name: 1 }).lean(),
      EventGameModel.find({ eventId }).lean()
    ]);

    const gameIds = Array.from(new Set(eventGames.map((item) => String(item.gameId))));
    const games = gameIds.length > 0
      ? await GameModel.find({ _id: { $in: gameIds.map((id) => asObjectId(id)) } }).lean()
      : [];

    const gameNameById = new Map(games.map((game) => [String(game._id), game.name]));

    const [overallTop3, locationTop3, gameTop3] = await Promise.all([
      leaderboardByMatch({ eventId }, 3),
      Promise.all(
        locations.map(async (location) => ({
          locationId: String(location._id),
          locationName: location.name,
          leaderboard: await leaderboardByMatch({ eventId, locationId: location._id }, 3)
        }))
      ),
      Promise.all(
        gameIds.map(async (gameId) => ({
          gameId,
          gameName: gameNameById.get(gameId) ?? "Unknown Game",
          leaderboard: await leaderboardByMatch({ eventId, gameId: asObjectId(gameId) }, 3)
        }))
      )
    ]);

    res.json({
      event: {
        _id: String(event._id),
        name: event.name,
        code: event.code,
        status: event.status
      },
      overallTop3,
      byLocation: locationTop3,
      byGame: gameTop3.sort((left, right) => left.gameName.localeCompare(right.gameName))
    });
  })
);

app.get(
  "/api/dashboard/summary",
  requireAuth,
  requireRole(["ADMIN"]),
  asyncHandler(async (req, res) => {
    const limit = Math.min(Number(req.query.limit ?? 50), 200);

    const [totalLocations, totalEventGames, leaderboard, distinctPlayers] = await Promise.all([
      LocationModel.countDocuments(),
      EventGameModel.countDocuments(),
      leaderboardByMatch({}, limit),
      ScoreEntryModel.distinct("playerId")
    ]);

    res.json({
      totalLocations,
      totalEventGames,
      totalPlayers: distinctPlayers.length,
      leaderboard
    });
  })
);

app.post(
  "/api/admin/stress-scenario",
  requireAuth,
  requireRole(["ADMIN"]),
  asyncHandler(async (req, res) => {
    const payload = parseOrThrow(stressScenarioSchema, req.body);
    const authorizationHeader = req.header("authorization") ?? "";

    if (!authorizationHeader.startsWith("Bearer ")) {
      throw new AppError(401, "Bearer token is required");
    }

    const token = authorizationHeader.slice("Bearer ".length).trim();
    if (!token) {
      throw new AppError(401, "Bearer token is required");
    }

    const logs: string[] = [];
    // Keep stress scenario traffic inside this process to avoid external proxy auth header stripping.
    const apiBaseUrl = `http://127.0.0.1:${config.port}`;

    let summary;
    try {
      summary = await runStressScenario({
        apiBaseUrl,
        adminToken: token,
        options: payload,
        log: (line) => {
          logs.push(line);
        }
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Stress scenario failed";
      throw new AppError(400, message);
    }

    res.json({ summary, logs });
  })
);

async function getPlayerProgress(playerId: string): Promise<{
  playerId: string;
  totals: {
    points: number;
    entries: number;
    distinctGames: number;
    distinctEvents: number;
    distinctLocations: number;
  };
  byGame: unknown[];
}> {
  const oid = asObjectId(playerId);

  const [totals, byGame] = await Promise.all([
    ScoreEntryModel.aggregate([
      { $match: { playerId: oid } },
      {
        $group: {
          _id: null,
          points: { $sum: "$points" },
          entries: { $sum: 1 },
          games: { $addToSet: "$gameId" },
          events: { $addToSet: "$eventId" },
          locations: { $addToSet: "$locationId" }
        }
      },
      {
        $project: {
          _id: 0,
          points: 1,
          entries: 1,
          distinctGames: { $size: "$games" },
          distinctEvents: { $size: "$events" },
          distinctLocations: { $size: "$locations" }
        }
      }
    ]),
    ScoreEntryModel.aggregate([
      { $match: { playerId: oid } },
      {
        $group: {
          _id: "$gameId",
          points: { $sum: "$points" },
          entries: { $sum: 1 },
          lastScoredAt: { $max: "$createdAt" }
        }
      },
      {
        $lookup: {
          from: "games",
          localField: "_id",
          foreignField: "_id",
          as: "game"
        }
      },
      { $unwind: { path: "$game", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 0,
          gameId: "$_id",
          gameName: "$game.name",
          points: 1,
          entries: 1,
          lastScoredAt: 1
        }
      },
      { $sort: { points: -1, lastScoredAt: -1 } }
    ])
  ]);

  return {
    playerId,
    totals: totals[0] ?? {
      points: 0,
      entries: 0,
      distinctGames: 0,
      distinctEvents: 0,
      distinctLocations: 0
    },
    byGame
  };
}

app.get(
  "/api/players/me/progress",
  requireAuth,
  requireRole(["PLAYER", "ADMIN"]),
  asyncHandler(async (req, res) => {
    if (!req.auth) {
      throw new AppError(401, "Authentication required");
    }

    let targetPlayerId = req.auth.playerId;
    if ((req.auth.role === "ADMIN" || req.auth.role === "SUPER_ADMIN") && typeof req.query.playerId === "string") {
      targetPlayerId = req.query.playerId;
    }

    if (!targetPlayerId) {
      throw new AppError(400, "No player profile linked. Register player account first.");
    }

    const progress = await getPlayerProgress(targetPlayerId);
    res.json(progress);
  })
);

app.get(
  "/api/leaderboards/game/:eventGameId",
  asyncHandler(async (req, res) => {
    const eventGameId = asObjectId(routeParam(req.params.eventGameId));
    const limit = Math.min(Number(req.query.limit ?? 50), 500);
    const leaderboard = await leaderboardByMatch({ eventGameId }, limit);
    res.json({ scope: "game", eventGameId, leaderboard });
  })
);

app.get(
  "/api/leaderboards/location/:locationId",
  asyncHandler(async (req, res) => {
    const locationId = asObjectId(routeParam(req.params.locationId));
    const limit = Math.min(Number(req.query.limit ?? 50), 500);
    const leaderboard = await leaderboardByMatch({ locationId }, limit);
    res.json({ scope: "location", locationId, leaderboard });
  })
);

app.get(
  "/api/leaderboards/event/:eventId",
  asyncHandler(async (req, res) => {
    const eventId = asObjectId(routeParam(req.params.eventId));
    const limit = Math.min(Number(req.query.limit ?? 50), 500);
    const leaderboard = await leaderboardByMatch({ eventId }, limit);
    res.json({ scope: "event", eventId, leaderboard });
  })
);

if (existsSync(frontendDistPath)) {
  app.use(express.static(frontendDistPath));
  app.get(/^(?!\/api|\/health).*/, (_req, res) => {
    res.sendFile(join(frontendDistPath, "index.html"));
  });
}

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ error: err.message });
    return;
  }

  if (err instanceof Error && err.message === "UNAUTHORIZED") {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  if (err instanceof Error && err.message === "FORBIDDEN") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  if (err instanceof Error && err.message.startsWith("Invalid ObjectId:")) {
    res.status(400).json({ error: err.message });
    return;
  }

  res.status(500).json({ error: "Unexpected server error" });
});

export { app };
