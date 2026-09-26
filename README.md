# UBC Carpool (helloHacks)

Share rides to UBC. Split the gas.

Stack: Next.js 14 (App Router) + TypeScript + Tailwind, Supabase, Google Maps Platform, Stripe Identity (test mode).

## Setup

```bash
npm install
cp .env.example .env.local   # fill in keys
npm run dev
```

The shared data contract lives in `src/lib/types.ts`. Treat it as frozen.
