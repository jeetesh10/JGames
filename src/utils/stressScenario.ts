type EventResponse = {
  _id: string;
  name: string;
};

type LocationResponse = {
  _id: string;
  name: string;
  eventId: string;
};

type GameResponse = {
  _id: string;
  name: string;
  key: string;
};

type EventGameResponse = {
  _id: string;
  eventId: string;
  locationId: string;
  gameId: string;
  title: string;
  joinToken: string;
};

type JoinResponse = {
  eventGameId: string;
  playerId: string;
  displayName: string;
};

type EventLeaderboardResponse = {
  scope: "event";
  eventId: string;
  leaderboard: Array<{
    rank: number;
    playerId: string;
    displayName: string;
    totalPoints: number;
    entries: number;
  }>;
};

export type StressScenarioOptions = {
  eventCount?: number;
  gamesPerEvent?: number;
  sharedGameCount?: number;
  locationCount?: number;
  playerCount?: number;
  concurrency?: number;
  maxScore?: number;
};

export type StressScenarioSummary = {
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
    leaders: Array<{
      rank: number;
      playerId: string;
      displayName: string;
      totalPoints: number;
      entries: number;
    }>;
  }>;
};

export type RunStressScenarioParams = {
  apiBaseUrl: string;
  adminToken: string;
  options?: StressScenarioOptions;
  log?: (line: string) => void;
};

function withDefaults(options: StressScenarioOptions = {}): Required<StressScenarioOptions> {
  return {
    eventCount: options.eventCount ?? 3,
    gamesPerEvent: options.gamesPerEvent ?? 5,
    sharedGameCount: options.sharedGameCount ?? 3,
    locationCount: options.locationCount ?? 5,
    playerCount: options.playerCount ?? 200,
    concurrency: options.concurrency ?? 50,
    maxScore: options.maxScore ?? 10
  };
}

function buildUrl(apiBaseUrl: string, path: string): string {
  return `${apiBaseUrl}${path}`;
}

function randomInt(minInclusive: number, maxInclusive: number): number {
  const random = Math.random();
  return Math.floor(random * (maxInclusive - minInclusive + 1)) + minInclusive;
}

function pickRandom<T>(items: T[]): T {
  return items[randomInt(0, items.length - 1)];
}

function compactKey(prefix: string, sequence: number): string {
  const safePrefix = prefix.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  const timePart = Date.now().toString(36);
  const randomPart = Math.random().toString(36).slice(2, 7);
  const base = `${safePrefix}_${sequence}_${timePart}_${randomPart}`;
  return base.slice(0, 40);
}

async function requestJson<T>(
  apiBaseUrl: string,
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const { headers: requestHeaders, ...rest } = init;
  const response = await fetch(buildUrl(apiBaseUrl, path), {
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

async function runWithConcurrency<T, R>(
  items: T[],
  workerConcurrency: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let currentIndex = 0;

  async function runWorker(): Promise<void> {
    while (currentIndex < items.length) {
      const itemIndex = currentIndex;
      currentIndex += 1;
      results[itemIndex] = await worker(items[itemIndex], itemIndex);
    }
  }

  const workers = Array.from({ length: Math.min(workerConcurrency, items.length) }, () => runWorker());
  await Promise.all(workers);
  return results;
}

function authHeaders(adminToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${adminToken}`
  };
}

function nowMs(): number {
  return Date.now();
}

export async function runStressScenario(params: RunStressScenarioParams): Promise<StressScenarioSummary> {
  const { apiBaseUrl, adminToken, log } = params;
  const options = withDefaults(params.options);

  if (options.sharedGameCount > options.gamesPerEvent) {
    throw new Error("sharedGameCount cannot be greater than gamesPerEvent");
  }

  log?.(`Running stress scenario at ${apiBaseUrl}`);
  log?.(
    `Events=${options.eventCount}, Games/Event=${options.gamesPerEvent}, Shared Games=${options.sharedGameCount}, Locations=${options.locationCount}, Players=${options.playerCount}, Concurrency=${options.concurrency}`
  );

  const startedAt = nowMs();

  const events: EventResponse[] = [];
  for (let index = 0; index < options.eventCount; index += 1) {
    const created = await requestJson<EventResponse>(apiBaseUrl, "/api/events", {
      method: "POST",
      headers: authHeaders(adminToken),
      body: JSON.stringify({
        name: `Stress Event ${index + 1}`,
        description: `Synthetic load test event ${index + 1}`,
        code: `SE${Date.now().toString().slice(-4)}${index + 1}`,
        status: "LIVE"
      })
    });
    events.push(created);
  }

  const sharedGames: GameResponse[] = [];
  for (let index = 0; index < options.sharedGameCount; index += 1) {
    const created = await requestJson<GameResponse>(apiBaseUrl, "/api/games", {
      method: "POST",
      headers: authHeaders(adminToken),
      body: JSON.stringify({
        name: `Shared Game ${index + 1}`,
        key: compactKey("shared_game", index + 1),
        scoringMode: "INDIVIDUAL",
        scoreUnit: "points"
      })
    });
    sharedGames.push(created);
  }

  const eventUniqueGames = new Map<string, GameResponse[]>();
  const uniqueGameCountPerEvent = options.gamesPerEvent - options.sharedGameCount;
  for (const event of events) {
    const createdGames: GameResponse[] = [];
    for (let index = 0; index < uniqueGameCountPerEvent; index += 1) {
      const created = await requestJson<GameResponse>(apiBaseUrl, "/api/games", {
        method: "POST",
        headers: authHeaders(adminToken),
        body: JSON.stringify({
          name: `Event ${event.name} Game ${index + 1}`,
          key: compactKey(`event_${event._id}_game`, index + 1),
          scoringMode: "INDIVIDUAL",
          scoreUnit: "points"
        })
      });
      createdGames.push(created);
    }
    eventUniqueGames.set(event._id, createdGames);
  }

  const eventLocations = new Map<string, LocationResponse[]>();
  for (const event of events) {
    eventLocations.set(event._id, []);
  }

  const assignedEventIndices: number[] = [];
  for (let index = 0; index < options.locationCount; index += 1) {
    if (index < events.length) {
      assignedEventIndices.push(index);
    } else {
      assignedEventIndices.push(randomInt(0, events.length - 1));
    }
  }

  for (let locationIndex = 0; locationIndex < options.locationCount; locationIndex += 1) {
    const eventIndex = assignedEventIndices[locationIndex];
    const event = events[eventIndex];
    const created = await requestJson<LocationResponse>(apiBaseUrl, `/api/events/${event._id}/locations`, {
      method: "POST",
      headers: authHeaders(adminToken),
      body: JSON.stringify({
        name: `Stress Location ${locationIndex + 1}`,
        code: `SL${locationIndex + 1}`,
        venue: `Zone ${locationIndex + 1}`
      })
    });

    const list = eventLocations.get(event._id);
    if (!list) {
      throw new Error(`Missing location bucket for event ${event._id}`);
    }

    list.push(created);
  }

  for (const event of events) {
    const locations = eventLocations.get(event._id) ?? [];
    if (locations.length === 0) {
      throw new Error(`Event ${event._id} has no locations assigned`);
    }
  }

  const eventGames: EventGameResponse[] = [];
  for (const event of events) {
    const locations = eventLocations.get(event._id) ?? [];
    const uniqueGames = eventUniqueGames.get(event._id) ?? [];
    const gamesForEvent = [...sharedGames, ...uniqueGames];

    for (let gameIndex = 0; gameIndex < gamesForEvent.length; gameIndex += 1) {
      const game = gamesForEvent[gameIndex];
      const location = locations[gameIndex % locations.length];
      const created = await requestJson<EventGameResponse>(apiBaseUrl, "/api/event-games", {
        method: "POST",
        headers: authHeaders(adminToken),
        body: JSON.stringify({
          eventId: event._id,
          locationId: location._id,
          gameId: game._id,
          title: `${event.name} - ${game.name}`,
          settings: {
            allowNegativeScores: false,
            maxEntriesPerPlayer: 1
          }
        })
      });
      eventGames.push(created);
    }
  }

  const players = Array.from({ length: options.playerCount }, (_, index) => ({
    displayName: `Stress Player ${index + 1}`,
    email: `stress-player-${Date.now()}-${index + 1}@example.com`,
    externalId: `stress-player-${Date.now()}-${index + 1}`
  }));

  const playerAssignments = players.map((player) => ({
    ...player,
    assignedEventGame: pickRandom(eventGames)
  }));

  const joinStartedAt = nowMs();
  const joinResults = await runWithConcurrency(playerAssignments, options.concurrency, async (assignment, index) => {
    const response = await requestJson<JoinResponse>(apiBaseUrl, `/api/join/${assignment.assignedEventGame.joinToken}`, {
      method: "POST",
      body: JSON.stringify({
        displayName: assignment.displayName,
        email: assignment.email,
        externalId: assignment.externalId
      })
    });

    if ((index + 1) % 50 === 0 || index === playerAssignments.length - 1) {
      log?.(`Joined ${index + 1}/${playerAssignments.length}`);
    }

    return {
      ...response,
      assignedEventGame: assignment.assignedEventGame
    };
  });
  const joinDurationMs = nowMs() - joinStartedAt;

  const scoreStartedAt = nowMs();
  await runWithConcurrency(joinResults, options.concurrency, async (joined, index) => {
    await requestJson(apiBaseUrl, "/api/scores", {
      method: "POST",
      headers: authHeaders(adminToken),
      body: JSON.stringify({
        eventGameId: joined.assignedEventGame._id,
        playerId: joined.playerId,
        points: randomInt(1, Math.max(1, options.maxScore)),
        source: "MANUAL"
      })
    });

    if ((index + 1) % 50 === 0 || index === joinResults.length - 1) {
      log?.(`Scored ${index + 1}/${joinResults.length}`);
    }
  });
  const scoreDurationMs = nowMs() - scoreStartedAt;

  const participantsByEventMap = new Map<string, number>();
  const participantsByLocationMap = new Map<string, number>();

  for (const joined of joinResults) {
    const eventId = joined.assignedEventGame.eventId;
    const locationId = joined.assignedEventGame.locationId;
    participantsByEventMap.set(eventId, (participantsByEventMap.get(eventId) ?? 0) + 1);
    participantsByLocationMap.set(locationId, (participantsByLocationMap.get(locationId) ?? 0) + 1);
  }

  const participantsByEvent = events.map((event) => ({
    eventId: event._id,
    eventName: event.name,
    count: participantsByEventMap.get(event._id) ?? 0
  }));

  const participantsByLocation: StressScenarioSummary["participantsByLocation"] = [];
  for (const event of events) {
    const locations = eventLocations.get(event._id) ?? [];
    for (const location of locations) {
      participantsByLocation.push({
        locationId: location._id,
        locationName: location.name,
        eventName: event.name,
        count: participantsByLocationMap.get(location._id) ?? 0
      });
    }
  }

  const topByEvent: StressScenarioSummary["topByEvent"] = [];
  for (const event of events) {
    const leaderboard = await requestJson<EventLeaderboardResponse>(apiBaseUrl, `/api/leaderboards/event/${event._id}?limit=3`);
    topByEvent.push({
      eventId: event._id,
      eventName: event.name,
      leaders: leaderboard.leaderboard.slice(0, 3)
    });
  }

  const totalDurationMs = nowMs() - startedAt;
  return {
    eventCount: events.length,
    gameTemplatesCreated: sharedGames.length + events.reduce((sum, event) => sum + (eventUniqueGames.get(event._id)?.length ?? 0), 0),
    eventGameCount: eventGames.length,
    locationCount: participantsByLocation.length,
    playerCount: joinResults.length,
    joinDurationMs,
    scoreDurationMs,
    totalDurationMs,
    participantsByEvent,
    participantsByLocation,
    topByEvent
  };
}