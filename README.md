# JGames

JGames is a full-stack event gaming platform for multi-location company programs.

It includes:

- an Express + TypeScript API
- a React + Vite admin/player web app
- MongoDB persistence with Mongoose
- QR-based join flow for player self-service

The product direction is mobile-first for players and desktop-friendly for admins.

## Core Capabilities

- Multi-event management with status workflow (`DRAFT`, `LIVE`, `CLOSED`)
- Multiple locations per event
- Reusable game templates
- Event-game deployments with per-game scoring rules
- Join flow using tokenized links and QR codes
- Leaderboards by game, location, and event
- Public event leaderboard page with shareable link
- Admin stress scenario generation for test data and load simulation

## Roles And Access

- `SUPER_ADMIN`
	- can create/edit admin users
	- can change own password
- `ADMIN`
	- can create and manage events, locations, games, event-games
	- can run stress scenarios
	- can submit admin scores
- `PLAYER`
	- optional authenticated player role for progress features
- Public join users
	- no login required for join-token flow
	- self-scoring uses signed join-session token controls

`SUPER_ADMIN` can satisfy `ADMIN`-gated routes, but only the configured super-admin email can manage admin users.

## Scoring Model

- Scoring authorities per event game:
	- `ADMIN_ONLY`
	- `PLAYER_SELF`
	- `HYBRID`
- Optional round mode with weighted round max points
- Player self-scoring constraints enforced server-side to prevent duplicate submits
- Player join email must be `@petsmart.com`

## Launch Wizard (Admin UI)

The launch wizard creates/deploys in 4 steps:

1. Select or create event
2. Select or create location (with template import option)
3. Select existing game or create a new one, then apply scoring settings
4. Generate/share player QR link

Latest behavior:

- new-game creation now uses collision-resistant keys
- duplicate key errors return a clear API message (`409`) instead of generic server error
- if a same-name game already exists, the wizard reuses it for deployment

## Public Leaderboard Experience

Route: `/leaderboard/event/:eventId`

Includes:

- event-level top 3
- top 3 by location
- top 3 by game
- player email visibility
- visual dashboard cards, bars, and a filter coverage gauge
- dynamic include/exclude filters for locations and games

## API Highlights

Health and auth:

- `GET /health`
- `POST /api/auth/login`
- `POST /api/auth/player/register`
- `POST /api/auth/change-password` (super-admin)

Admin users:

- `POST /api/admin/users` (super-admin)
- `GET /api/admin/users` (super-admin)
- `PATCH /api/admin/users/:userId` (super-admin)

Event setup:

- `POST /api/events`
- `GET /api/events`
- `PATCH /api/events/:eventId`
- `POST /api/events/:eventId/locations`
- `GET /api/events/:eventId/locations`
- `GET /api/locations`
- `PATCH /api/events/:eventId/locations/:locationId`
- `POST /api/games`
- `GET /api/games`
- `PATCH /api/games/:gameId`
- `POST /api/event-games`
- `PATCH /api/event-games/:eventGameId`
- `GET /api/event-games/:eventGameId/join-link`

Join and scoring:

- `GET /api/join/:joinToken/meta`
- `POST /api/join/:joinToken`
- `GET /api/join/:joinToken/session-state`
- `POST /api/join/:joinToken/scores`
- `POST /api/scores`
- `POST /api/player/scores`
- `POST /api/game-admin/scores`

Leaderboards and metrics:

- `GET /api/leaderboards/game/:eventGameId`
- `GET /api/leaderboards/location/:locationId`
- `GET /api/leaderboards/event/:eventId`
- `GET /api/public/leaderboards/event/:eventId`
- `GET /api/players/me/progress`
- `GET /api/dashboard/summary`

Stress scenario:

- `POST /api/admin/stress-scenario`

OpenAPI starter spec: `docs/openapi.yaml`

## Local Development

1. Install dependencies:

```bash
npm install
```

2. Configure environment variables:

```bash
MONGODB_URI=mongodb://127.0.0.1:27017/jgames
PORT=4000
PUBLIC_BASE_URL=http://localhost:4000
JWT_SECRET=replace-with-long-random-secret
SUPER_ADMIN_EMAIL=jeetesh.bahuguna@gmail.com
SUPER_ADMIN_INITIAL_PASSWORD=ChangeMe
```

3. Start the app:

```bash
npm run dev
```

Runs:

- API at `http://localhost:4000`
- Web app at `http://localhost:5173`

4. Type check and build:

```bash
npm run typecheck
npm run build
```

## Admin Bootstrap

Super-admin is auto-seeded on startup if missing using:

- `SUPER_ADMIN_EMAIL`
- `SUPER_ADMIN_INITIAL_PASSWORD`

You can also create additional admin users via script:

```bash
npm run create:admin -- admin@petsmart.com strong-password
```

## Deployment Notes (Cloud Run)

- Do not hardcode `PORT` in runtime; Cloud Run injects it.
- `PUBLIC_BASE_URL` should be your deployed HTTPS service URL.
- Stress runs write real records; use staging when possible.

Deployment artifacts:

- `Dockerfile`
- `cloudrun.yaml`
- `deploy-cloud-run.sh`

## Operational Notes

- Keep secrets out of source control.
- Rotate credentials if they were exposed in logs or history.
- If UI behavior looks stale after release, verify the latest backend revision is deployed and serving traffic.