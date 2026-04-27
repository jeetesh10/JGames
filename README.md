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

### Cloud Run Deployment

This repository is Cloud Run-ready using the included multi-stage `Dockerfile`.

Before deploying, review `cloudrun.yaml`. It is configured for scale-to-zero:

- `autoscaling.knative.dev/minScale: "0"` means no always-on instances.
- `run.googleapis.com/cpu-throttling: "true"` means CPU is throttled outside requests.

1. Update placeholders in `cloudrun.yaml`:

- `PROJECT_ID` in image path
- `REPLACE_MONGODB_URI`
- `REPLACE_JWT_SECRET`
- `REPLACE_PUBLIC_BASE_URL`

2. Set your Google Cloud project:

```bash
gcloud config set project <YOUR_GCP_PROJECT_ID>
```

3. Build and push the container image with Cloud Build:

```bash
gcloud builds submit --tag gcr.io/<YOUR_GCP_PROJECT_ID>/jgames
```

4. Deploy from the reviewed manifest:

```bash
gcloud run services replace cloudrun.yaml --region <YOUR_REGION>
```

Notes:

- Cloud Run injects `PORT`; the API already reads this value.
- `PUBLIC_BASE_URL` should match your Cloud Run HTTPS URL.
- You can update secrets later with `gcloud run services update` if needed.

Validate scale-to-zero config after deploy:

```bash
gcloud run services describe jgames \
  --region <YOUR_REGION> \
  --format="yaml(spec.template.metadata.annotations)"
```

## Current Project State (Codespace Handoff)

This section is a snapshot for pausing work and resuming later from a new codespace.

### What Is Already Done

- Backend + frontend are integrated and deployable via container.
- Cloud Run deployment files are present:
	- `Dockerfile`
	- `.dockerignore`
	- `cloudrun.yaml`
	- `deploy-cloud-run.sh`
- Cloud Run configuration is set for scale-to-zero behavior:
	- `autoscaling.knative.dev/minScale: "0"`
	- `run.googleapis.com/cpu-throttling: "true"`
- Cloud Build lockfile compatibility issue was fixed (`npm ci` on npm 10).
- Cloud Run startup issue was fixed by listening on `PORT` before DB connection and retrying DB connection in the background.
- Admin UI now has a **Stress Test** modal that can trigger stress test data generation and load simulation.
- Backend has an admin endpoint for stress execution.
- Stress scenario game key generation was fixed to stay within schema key length limits.

### Stress Test Capability (Now Available)

You can run a scenario for:

- multiple events
- multiple games per event
- shared games across events
- random location assignment
- concurrent player join and score submission

Default UI scenario values currently align with:

- 3 events
- 5 games/event
- 5 locations
- 200 players
- high concurrency

### Important Behavior Notes

- Cloud Run production runtime should not set `PORT` manually.
- Cloud Run injects `PORT` automatically (typically `8080`).
- `PUBLIC_BASE_URL` in production must be the Cloud Run service URL, not a `github.dev` URL.
- Stress runs create real records. Use staging data/environment when possible.

### Resume Checklist (New Codespace)

1. Clone/open repo and install dependencies:

```bash
npm install
```

2. Configure `.env` for local development only:

```bash
MONGODB_URI=...
JWT_SECRET=...
PORT=4000
PUBLIC_BASE_URL=http://localhost:4000
```

3. Start local dev:

```bash
npm run dev
```

4. For Cloud Run deploys, verify latest commit is deployed and revision is healthy.

### Production Verification Checklist

1. Confirm latest commit on `main` is deployed by Cloud Build.
2. Confirm latest Cloud Run revision is receiving `100%` traffic.
3. Open `/health` and verify API response.
4. Open Admin UI and verify Stress Test modal opens and executes.

### Operational Security Reminder

- Do not keep production secrets in docs or committed files.
- Rotate credentials/secrets if they were exposed in chat history or logs.