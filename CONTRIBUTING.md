# Contributing to Nexus Judge

Thanks for taking an interest in improving this project!  
This doc covers the folder layout, how to run things locally, and how to test multiplayer in two browser tabs without any extra infrastructure.

---

## Prerequisites

| Tool | Version |
|------|---------|
| Node.js | 18 + |
| npm | 9 + |
| Supabase project | Only needed for multiplayer testing — see below |

---

## Getting started

```bash
git clone https://github.com/Marcsmind/Mtg-judge.git
cd Mtg-judge
npm install
npm run dev          # starts Vite dev server on http://localhost:5173
```

---

## Project layout

```
src/
├── components/          # Shared UI widgets (Sidebar, Toast, SettingsPanel, …)
├── constants/           # storageKeys.ts, tabIds.ts, themes.ts
├── services/            # External integrations
│   ├── gemini.ts        # Gemini API wrapper (proxy-aware)
│   ├── multiplayerSync.ts  # Supabase Realtime broadcast + reconnect logic
│   ├── scryfall.ts      # Card data + image helpers
│   └── supabase.ts      # Supabase client (reads VITE_SUPABASE_* env vars)
├── store/               # Zustand global store (useAppStore)
├── types/
│   └── game.ts          # Canonical Player, ActiveCounters, DayNightState types
├── utils/               # haptics, misc helpers
└── views/
    ├── life-counter/    # Sub-components: PlayerCard, GameSummaryModal, …
    ├── AIJudge.tsx
    ├── DeckBuilder.tsx
    ├── DiceAndCoins.tsx
    ├── LifeCounter.tsx
    ├── QuickRules.tsx
    └── TurnOrder.tsx

netlify/
└── functions/
    └── gemini-proxy.ts  # Serverless proxy — keeps the shared Gemini key server-side
```

---

## Environment variables

Create a `.env.local` file at the repo root (never committed):

```env
# Supabase — required for multiplayer
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key

# Netlify function (local dev via `netlify dev`)
ACCESS_CODE=MAGIC          # optional — gates the shared Gemini key
GEMINI_API_KEY=AIzaSy...   # server-side key used by the proxy function
```

`VITE_*` variables are baked at build time by Vite.  
`ACCESS_CODE` and `GEMINI_API_KEY` are only read by the Netlify function at runtime (never exposed to the browser).

---

## Available scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | Vite dev server with HMR |
| `npm run build` | TypeScript check + production build → `dist/` |
| `npm run lint` | ESLint across all `src/` files |
| `npm run preview` | Serve the `dist/` build locally |
| `npm test` | Vitest unit tests (pure logic functions) |

The Netlify build command is `npm run lint && npm run build` — lint errors block deployment.

---

## Testing multiplayer locally (two browser tabs)

Multiplayer uses **Supabase Realtime Broadcast** — ephemeral pub/sub with no database writes.

1. Make sure `.env.local` has your `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
2. Run `npm run dev`.
3. Open **Tab A** → Life Counter → "Create Room" → note the 4-character code.
4. Open **Tab B** (same browser is fine) → Life Counter → "Join Room" → enter the code.
5. Change life totals in either tab — both tabs update in under a second.

No Supabase tables or migrations are needed; the channel is created automatically on first subscribe and torn down when both clients leave.

---

## Adding a new theme palette

1. Open `src/constants/themes.ts`.
2. Add a new entry to the `THEMES` array with your `id`, `label`, `swatch`, `emoji`, and `vars` (CSS custom property overrides).
3. That's it — `applyTheme()` handles the rest and the swatch appears in Settings automatically.

---

## Key architectural decisions

| Decision | Rationale |
|----------|-----------|
| **Shared `src/types/game.ts`** | Eliminates duplicate `Player` interface definitions across LifeCounter, modals, and multiplayerSync |
| **`SYNC_SCHEMA_VERSION`** | Payloads with a mismatched version are silently discarded to prevent data corruption during rolling deploys |
| **Inline styles over CSS modules** | Consistent with the existing glass-panel design system; CSS custom properties provide theming without a build step |
| **Supabase Broadcast (not DB)** | No schema migrations, no auth, no persistent rows — ephemeral game state only |
| **`PlayerCard` extraction** | Reduces LifeCounter.tsx from ~1,600 lines to a manageable size; PlayerCard is purely presentational with all state owned by the parent |

---

## Commit style

Use conventional commits for clarity:

```
feat: add mana curve chart to Deck Builder
fix: token picker closes on outside tap (mobile)
chore: delete unused hero.png asset
```

End commit messages with:

```
Co-Authored-By: Your Name <your@email.com>
```
