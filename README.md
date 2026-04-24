# JGames

API-first backend for managing company game events across multiple locations.

This backend is intended to support a mobile-first player experience and a responsive admin experience for laptop/desktop users.

The repository now includes a direct-use web frontend so the platform can be used immediately before a later microfrontend integration phase.

## What This Supports

- Multiple events (for example, a company sports day or game week)
- Multiple locations per event
- Multiple games per location/event
- Player join flow via tokenized link or QR code (no login required)
- Optional player login only for tracking personal progress
- Score submissions per player/game
- Leaderboards at:
	- game level
	- location level
	- event level

## Tech Stack

- Node.js + Express (TypeScript)
- React + Vite frontend
- MongoDB Atlas / MongoDB (Mongoose)
- Zod validation
- QR generation via `qrcode`

## Domain Model

- `Event`
- `Location` (belongs to an event)
- `Game` (template/settings)
- `EventGame` (game running at an event + location)
- `Player`
- `Participation` (player joins an event game)
- `ScoreEntry` (score records used for leaderboards)

## API Endpoints

- `GET /health`
- `POST /api/auth/player/register`
- `POST /api/auth/login`
- `POST /api/events`
- `GET /api/events`
- `POST /api/events/:eventId/locations`
- `GET /api/events/:eventId/locations`
- `POST /api/games`
- `GET /api/games`
- `POST /api/event-games`
- `GET /api/event-games/:eventGameId/join-link`
- `POST /api/join/:joinToken`
- `POST /api/scores`
- `GET /api/leaderboards/game/:eventGameId`
- `GET /api/leaderboards/location/:locationId`
- `GET /api/leaderboards/event/:eventId`
- `GET /api/players/me/progress`

## Access Model

- Admin endpoints (event/game/location setup, score entry): require admin login.
- Join and play flow: no login needed.
- Player progress endpoint: requires player login (optional).

OpenAPI starter spec: `docs/openapi.yaml`

## Local Setup

1. Install dependencies:

```bash
npm install
```

2. Configure environment variables:

```bash
export MONGODB_URI='mongodb+srv://<user>:<pass>@<cluster>/<db>?retryWrites=true&w=majority'
export PORT=4000
export PUBLIC_BASE_URL='http://localhost:4000'
export JWT_SECRET='replace-with-long-random-secret'
```

If you prefer, put the same keys in a `.env` file.

3. Run development server:

```bash
npm run dev
```

This starts:

- the API on port `4000`
- the frontend on port `5173`

4. Production build/run:

```bash
npm run build
npm start
```

In production, the Express server serves the built frontend from the same deployment.

## Create The First Admin

Admin accounts are created manually from the backend, not through a public registration endpoint.

```bash
npm run create:admin -- admin@example.com strong-password
```

After that, sign in from the Admin page or call `POST /api/auth/login`.

## Microfrontend-Ready Notes

- API is stateless and front-end agnostic.
- Join flow is exposed as plain JSON (join URL + QR data URL) for easy UI composition.
- Response format is clean JSON suited for multiple frontend clients.
- Player-facing UI should be mobile-first.
- Admin-facing UI should be responsive, with laptop/desktop as the primary management surface.
- Current frontend is intentionally structured as a direct-use app first, so it can later be split into separate player/admin microfrontends with shared API contracts.

UI and UX requirements: `docs/ui-requirements.md`

## Deployment Targets

- Vercel (Node runtime)
- GCP Cloud Run / App Engine

For both platforms:

- set `MONGODB_URI`
- set `PUBLIC_BASE_URL` to your deployed API URL