export type AppRole = "ADMIN" | "PLAYER" | "SUPER_ADMIN";

export interface LoginResponse {
  token: string;
  role: AppRole;
  playerId?: string;
}

export interface EventRecord {
  _id: string;
  name: string;
  code: string;
  eventDate: string;
  description: string;
  sponsor?: string;
  status: "DRAFT" | "LIVE" | "CLOSED";
  scoringAuthority: "ADMIN_ONLY" | "PLAYER_SELF" | "HYBRID";
  startsAt?: string;
  endsAt?: string;
}

export interface GameRecord {
  _id: string;
  name: string;
  key: string;
  scoringMode: "INDIVIDUAL" | "CUMULATIVE";
  scoreUnit: string;
}

export interface LocationRecord {
  _id: string;
  eventId: string;
  name: string;
  code?: string;
  venue?: string;
}

export interface EventGameRecord {
  _id: string;
  eventId: string;
  locationId: string;
  gameId: string;
  joinToken: string;
  title?: string;
  settings?: {
    scoringAuthority?: "ADMIN_ONLY" | "PLAYER_SELF" | "HYBRID";
    allowNegativeScores?: boolean;
    maxEntriesPerPlayer?: number;
    roundsEnabled?: boolean;
    totalRounds?: number;
    maxPointsPerRound?: number;
    roundMaxPoints?: number[];
  };
}

export interface JoinLinkResponse {
  eventGameId: string;
  joinToken: string;
  joinUrl: string;
  qrCodeDataUrl: string;
  playerUrl?: string;
  playerQrCodeDataUrl?: string;
  adminUrl?: string;
  adminQrCodeDataUrl?: string;
}

export interface JoinResponse {
  message: string;
  eventGameId: string;
  playerId: string;
  displayName: string;
  joinSessionToken: string;
}

export interface JoinSessionStateResponse {
  playerId: string;
  eventGameId: string;
  entries: number;
  totalPoints: number;
  completedRounds: number[];
  nextRoundNumber: number | null;
  isComplete: boolean;
}

export interface JoinTokenMetaResponse {
  eventGame: {
    _id: string;
    title?: string;
    joinToken: string;
    settings?: {
      roundsEnabled?: boolean;
      totalRounds?: number;
      maxPointsPerRound?: number;
      roundMaxPoints?: number[];
    };
    scoringAuthority?: "ADMIN_ONLY" | "PLAYER_SELF" | "HYBRID";
    event: { _id: string; name: string } | null;
    location: { _id: string; name: string } | null;
    game: { _id: string; name: string; scoreUnit: string } | null;
  };
}

export interface ProgressResponse {
  playerId: string;
  totals: {
    points: number;
    entries: number;
    distinctGames: number;
    distinctEvents: number;
    distinctLocations: number;
  };
  byGame: Array<{
    gameId: string;
    gameName?: string;
    points: number;
    entries: number;
    lastScoredAt?: string;
  }>;
}

export interface LeaderboardEntry {
  rank: number;
  playerId: string;
  displayName: string;
  email?: string;
  totalPoints: number;
  entries: number;
  lastScoredAt?: string;
}

export interface LeaderboardResponse {
  scope: "game" | "location" | "event";
  eventGameId?: string;
  locationId?: string;
  eventId?: string;
  leaderboard: LeaderboardEntry[];
}

export interface DashboardSummaryResponse {
  totalLocations: number;
  totalEventGames: number;
  totalPlayers: number;
  leaderboard: LeaderboardEntry[];
}

export interface EventGameParticipantsResponse {
  eventGame: {
    _id: string;
    title?: string;
    joinToken: string;
    event: { _id: string; name: string } | null;
    location: { _id: string; name: string } | null;
    game: { _id: string; name: string; scoreUnit: string } | null;
  };
  participants: Array<{
    playerId: string;
    displayName: string;
    email?: string;
    joinedAt?: string;
    totalPoints: number;
    entries: number;
    lastScoredAt?: string;
  }>;
}

export interface ScoreEntryRecord {
  _id: string;
  eventId: string;
  locationId: string;
  eventGameId: string;
  gameId: string;
  playerId: string;
  points: number;
  roundNumber?: number;
  source: "MANUAL" | "AUTO" | "SELF";
}

export interface StressScenarioRequest {
  eventCount: number;
  gamesPerEvent: number;
  sharedGameCount: number;
  locationCount: number;
  playerCount: number;
  concurrency: number;
  maxScore: number;
}

export interface StressScenarioSummary {
  eventCount: number;
  gameTemplatesCreated: number;
  eventGameCount: number;
  locationCount: number;
  playerCount: number;
  joinDurationMs: number;
  scoreDurationMs: number;
  totalDurationMs: number;
  participantsByEvent: Array<{
    eventId: string;
    eventName: string;
    count: number;
  }>;
  participantsByLocation: Array<{
    locationId: string;
    locationName: string;
    eventName: string;
    count: number;
  }>;
  topByEvent: Array<{
    eventId: string;
    eventName: string;
    leaders: LeaderboardEntry[];
  }>;
}

export interface StressScenarioResponse {
  summary: StressScenarioSummary;
  logs: string[];
}

export interface CreateAdminUserResponse {
  userId: string;
  email: string;
  role: AppRole;
  createdAt?: string;
  updatedAt?: string;
}

export interface AdminUserRecord {
  userId: string;
  email: string;
  role: AppRole;
  createdAt?: string;
  updatedAt?: string;
}

export interface PublicEventLeaderboardResponse {
  event: {
    _id: string;
    name: string;
    code: string;
    status: "DRAFT" | "LIVE" | "CLOSED";
  };
  overallTop3: LeaderboardEntry[];
  byLocation: Array<{
    locationId: string;
    locationName: string;
    leaderboard: LeaderboardEntry[];
  }>;
  byGame: Array<{
    gameId: string;
    gameName: string;
    leaderboard: LeaderboardEntry[];
  }>;
}
