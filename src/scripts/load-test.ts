type JoinResponse = {
  message: string;
  eventGameId: string;
  playerId: string;
  displayName: string;
};

type LeaderboardResponse = {
  scope: "game" | "location" | "event";
  eventGameId?: string;
  locationId?: string;
  eventId?: string;
  leaderboard: Array<{
    rank: number;
    playerId: string;
    displayName: string;
    totalPoints: number;
    entries: number;
    lastScoredAt?: string;
  }>;
};

const apiBaseUrl = process.env.API_BASE_URL ?? process.env.PUBLIC_BASE_URL ?? "http://localhost:4000";
const joinToken = process.env.JOIN_TOKEN;
const adminToken = process.env.ADMIN_TOKEN;
const totalPlayers = Number(process.env.COUNT ?? 400);
const concurrency = Number(process.env.CONCURRENCY ?? 40);

if (!joinToken) {
  throw new Error("JOIN_TOKEN is required");
}

function buildUrl(path: string): string {
  return `${apiBaseUrl}${path}`;
}

async function requestJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { headers: requestHeaders, ...rest } = init;
  const response = await fetch(buildUrl(path), {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      ...(requestHeaders ?? {})
    }
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) as unknown : undefined;

  if (!response.ok) {
    const message = typeof payload === "object" && payload && "error" in payload
      ? String((payload as { error: unknown }).error)
      : `Request failed with ${response.status}`;
    throw new Error(message);
  }

  return payload as T;
}

async function runWithConcurrency<T, R>(items: T[], worker: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let currentIndex = 0;

  async function runWorker(): Promise<void> {
    while (currentIndex < items.length) {
      const itemIndex = currentIndex;
      currentIndex += 1;
      results[itemIndex] = await worker(items[itemIndex], itemIndex);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => runWorker());
  await Promise.all(workers);
  return results;
}

async function main(): Promise<void> {
  const players = Array.from({ length: totalPlayers }, (_, index) => ({
    displayName: `Load Player ${index + 1}`,
    email: `load-player-${index + 1}@example.com`,
    externalId: `load-player-${index + 1}`
  }));

  const startedAt = performance.now();
  console.log(`Joining ${totalPlayers} players at ${apiBaseUrl} using concurrency ${concurrency}...`);

  const joinResults = await runWithConcurrency(players, async (player, index) => {
    const response = await requestJson<JoinResponse>(`/api/join/${joinToken}`, {
      method: "POST",
      body: JSON.stringify(player)
    });

    if ((index + 1) % 50 === 0 || index === players.length - 1) {
      console.log(`Joined ${index + 1}/${players.length}`);
    }

    return response;
  });

  const joinDurationMs = performance.now() - startedAt;
  const uniqueEventGameId = joinResults[0]?.eventGameId;
  console.log(`Join phase completed in ${joinDurationMs.toFixed(1)}ms`);

  if (adminToken && uniqueEventGameId) {
    const scoreStartedAt = performance.now();
    console.log("Submitting scores...");

    await runWithConcurrency(joinResults, async (joinResult, index) => {
      await requestJson(`/api/scores`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${adminToken}`
        },
        body: JSON.stringify({
          eventGameId: uniqueEventGameId,
          playerId: joinResult.playerId,
          points: (index % 10) + 1,
          source: "MANUAL"
        })
      });

      if ((index + 1) % 50 === 0 || index === joinResults.length - 1) {
        console.log(`Scored ${index + 1}/${joinResults.length}`);
      }
    });

    const scoreDurationMs = performance.now() - scoreStartedAt;
    console.log(`Score phase completed in ${scoreDurationMs.toFixed(1)}ms`);

    const leaderboard = await requestJson<LeaderboardResponse>(`/api/leaderboards/game/${uniqueEventGameId}?limit=10`);
    console.log("Top leaderboard entries:");
    for (const entry of leaderboard.leaderboard.slice(0, 10)) {
      console.log(`${entry.rank}. ${entry.displayName} - ${entry.totalPoints} points (${entry.entries} entries)`);
    }
  } else {
    console.log("ADMIN_TOKEN not set, skipping score submission and leaderboard verification.");
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
