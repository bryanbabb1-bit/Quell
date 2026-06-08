# Local Setup

Match Play is a monorepo: `api/` (Cloudflare Workers + D1) and `app/` (Expo).
Both share one Clerk instance.

## 0. Prerequisites
- Node 20+
- A [Clerk](https://clerk.com) application (free tier is fine). Enable
  **Email + Password** sign-in for the scaffold's auth screen.
- A Cloudflare account (for D1 + Workers). `wrangler` is a dev dependency, so
  `npx wrangler login` once.

## 1. API (`api/`)
```bash
cd api
npm install

# Create the D1 database, then paste the printed database_id into wrangler.toml
npm run db:create

# Local secrets
cp .dev.vars.example .dev.vars      # fill in CLERK_SECRET_KEY + CLERK_PUBLISHABLE_KEY

# Apply the schema to the local D1
npm run db:migrate:local

# Run the worker (defaults to http://localhost:8787)
npm run dev
```

Smoke test (no auth required):
```bash
curl http://localhost:8787/health
# -> {"ok":true,"timestamp":"...","env":"development"}
```

## 2. App (`app/`)
```bash
cd app
npm install

cp .env.example .env
#   EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY = same Clerk instance as the API
#   EXPO_PUBLIC_API_BASE_URL          = http://localhost:8787
#     (use your machine's LAN IP, not localhost, on a physical device)

npm run ios       # or: npm run android / npm start
```

## 3. Verify the auth round-trip
1. Launch the app → you land on the **Sign in** screen.
2. Create an account (email + password).
3. You're routed to **Discovery**, which shows your email + handicap — proof the
   app minted a Clerk JWT, the Worker verified it, and `/me` upserted your row
   in D1.

## What's stubbed
`/matches`, `/matches/:id/scorecard`, `/matches/:id/reveal`, and
`/matches/:id/messages` return `501 Not implemented` with their intended
contracts documented in the route files. They're built out in the next phases.

## Deploying the API (when ready)
```bash
cd api
# set production secrets on the worker
npx wrangler secret put CLERK_SECRET_KEY
npx wrangler secret put CLERK_PUBLISHABLE_KEY
npm run db:migrate:remote
npm run deploy
```
