import { runStressScenario } from "../utils/stressScenario.js";

const apiBaseUrl = process.env.API_BASE_URL ?? process.env.PUBLIC_BASE_URL ?? "http://localhost:4000";
const adminToken = process.env.ADMIN_TOKEN;
const adminEmail = process.env.ADMIN_EMAIL;
const adminPassword = process.env.ADMIN_PASSWORD;

const eventCount = Number(process.env.EVENT_COUNT ?? 3);
const gamesPerEvent = Number(process.env.GAMES_PER_EVENT ?? 5);
const sharedGameCount = Number(process.env.SHARED_GAME_COUNT ?? 3);
const locationCount = Number(process.env.LOCATION_COUNT ?? 5);
const playerCount = Number(process.env.PLAYER_COUNT ?? 200);
const concurrency = Number(process.env.CONCURRENCY ?? 50);
const maxScore = Number(process.env.MAX_SCORE ?? 10);

if (sharedGameCount > gamesPerEvent) {
  throw new Error("SHARED_GAME_COUNT cannot be greater than GAMES_PER_EVENT");
}

if (!adminToken && (!adminEmail || !adminPassword)) {
  throw new Error("Set ADMIN_TOKEN or provide ADMIN_EMAIL and ADMIN_PASSWORD");
}

type AuthResponse = {
  token: string;
  role: string;
};

async function resolveToken(): Promise<string> {
  if (adminToken) {
    return adminToken;
  }

  const response = await fetch(`${apiBaseUrl}/api/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ email: adminEmail, password: adminPassword })
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) as unknown : undefined;

  if (!response.ok) {
    const message = typeof payload === "object" && payload && "error" in payload
      ? String((payload as { error: unknown }).error)
      : `Login failed with ${response.status}`;
    throw new Error(message);
  }

  const auth = payload as AuthResponse;
  if (auth.role !== "ADMIN") {
    throw new Error("Provided account is not an ADMIN user");
  }

  return auth.token;
}

async function main(): Promise<void> {
  const resolvedToken = await resolveToken();

  const summary = await runStressScenario({
    apiBaseUrl,
    adminToken: resolvedToken,
    options: {
      eventCount,
      gamesPerEvent,
      sharedGameCount,
      locationCount,
      playerCount,
      concurrency,
      maxScore
    },
    log: (line) => {
      console.log(line);
    }
  });

  console.log(`Join phase: ${summary.joinDurationMs.toFixed(1)}ms`);
  console.log(`Score phase: ${summary.scoreDurationMs.toFixed(1)}ms`);
  console.log(`Total scenario time: ${summary.totalDurationMs.toFixed(1)}ms`);
}

main().catch((error: unknown) => {
  if (error instanceof Error) {
    console.error(`Stress scenario failed: ${error.message}`);
  } else {
    console.error(error);
  }
  process.exit(1);
});