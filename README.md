# Hold

An attention trainer. Serves progressively longer videos — 45 seconds up to a
hard three-minute cap — and measures whether you actually held them.

**Live:** https://ritvikmodani.github.io/hold/

## Why it works this way

Watching longer videos does not, on its own, train attention. A well-made video
holds your attention *for* you; that is its entire job. Every protocol in the
attention-training literature that produces measurable change trains an **active
task**, not passive exposure.

So every rep here ends in a **free-recall prompt** — one sentence, from memory,
before you are shown what the video actually said — and the app records **drift
events** whenever focus leaves the player. Those two things are the difference
between measuring attention and measuring video tolerance.

Sessions are **five reps and then they stop**. There is no infinite scroll. An
endless feed of longer videos would just be a slower TikTok.

## Setup

```bash
npm install
npm run dev
```

Videos work immediately — the harvested pool ships with the repo.

### Refreshing the content pool (optional)

```bash
cp .env.example .env    # then paste a YouTube Data API v3 key
npm run harvest
```

Costs roughly **100 of your 10,000 daily quota units and zero search calls**. It
resolves each channel handle to its uploads playlist and pages that, rather than
using `search.list` — which costs 100 units *and* one of only 100 daily search
calls per query. The key never reaches the browser.

### Sync and leaderboard (optional)

Leave it unconfigured and the app runs on `localStorage` alone; the sync and
board UI never render. Nothing is ever gated behind an account.

1. Create a project at [supabase.com](https://supabase.com)
2. Open `supabase/schema.sql`, copy its **contents** into the Supabase SQL
   editor and run them (idempotent — safe to re-run)
3. Authentication → Providers → Google, and paste your OAuth client ID and
   secret **there**
4. Put the project URL and anon key in `.env` as `VITE_SUPABASE_URL` and
   `VITE_SUPABASE_ANON_KEY`, then restart the dev server

Add every origin you use — `http://localhost:5173`, your deployed URL — to both
Google's authorized redirect URIs and Supabase's redirect allowlist, or sign-in
bounces.

## Commands

```bash
npm run dev       # dev server
npm test          # 49 tests over the ladder, stats and merge logic
npm run build     # static output
npm run harvest   # refresh the video pool
```

## Structure

| | |
|---|---|
| `scripts/harvest.mjs` | Fills the content pool. The only thing that talks to Google. |
| `src/lib/ladder.ts` | Rung math: promotion, demotion, what counts as a clean rep. Pure. |
| `src/lib/stats.ts` | Every derived number on the stats page. Pure, `now` injected. |
| `src/lib/sync.ts` | Two-device merge. Pure set union over immutable events. |
| `src/lib/leaderboard.ts` | Publishes aggregates only — never reps or recall text. |
| `src/lib/store.ts` | Append-only log in `localStorage`. |
| `src/hooks/` | YouTube IFrame wrapper, attention-drift recorder, auth. |
| `src/features/` | Home, Session, Cockpit, Leaderboard, Sync. |
| `supabase/schema.sql` | Tables and row-level security policies. |

`ladder.ts`, `stats.ts` and `sync.ts` are pure functions with 49 tests, because
a bug in any of them would make every number the app shows a quiet lie.

## The ladder

Rungs: 45, 60, 75, 90, 110, 130, 150, 165, 180 seconds.

A rep counts only if you watched at least 95% of it, drifted for less than 10%
of its length, **and** wrote something from memory afterwards. Three clean reps
on distinct videos moves you up a rung. Two consecutive misses moves you down
one — never more, because one bad day should not erase a week.

Your current rung is *replayed from the log* rather than stored, so no saved
value can contradict the history behind it.

## Sync

Reps are immutable events with client-generated ids, so merging two devices is a
**set union** — no conflicts, nothing lost. The merge sorts by time because the
ladder replays the log in order, and breaks ties on id so both devices converge
on identical output.

Row-level security is the security model. The anon key is public by design and
ships in the bundle; it is safe only because every policy restricts rows to
`auth.uid()`. Adding a table without RLS would expose it.

## Leaderboard

Ranked by **focus ceiling**, not minutes watched. Minutes would reward leaving a
video running in a dead tab — the exact behaviour the drift detector exists to
catch. A ceiling requires 95% watched, under 10% drift, and a typed recall
answer, so it is hard to post without having actually paid attention.

Only four aggregates are published — ceiling, clean reps, minutes, streak — plus
a display name you choose. Your reps, the videos you watched and everything you
wrote never leave your device.

## Interface notes

- **Phone:** the video owns the screen. Swipe up to move on.
- **Laptop:** a side rail carries rung, rep progress, ceiling and live drift
  count, so wide screens do not waste their flanks. Scroll or press `↓` to move
  on, `Esc` to cancel.
- Only the **first** video of a session needs a tap. Browsers require one
  gesture before unmuted playback; after that, reps start on their own.
- A blurred still of the video fills the letterbox bars, since YouTube is 16:9
  and phones are not.
- `?seed=200` fills the log with a synthetic history to see the stats populated.
  `?seed=0` wipes it.

## Known constraints

- If a video neither loads nor errors within 8 seconds it is blacklisted and
  swapped. Some unavailable videos fire no error at all, so silence has to be
  treated as failure or the session hangs forever.
- Skipping is always allowed, but costs the rep and sits behind a five-second
  pause. The friction is the point.
