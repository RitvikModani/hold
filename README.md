# Hold

An attention trainer. Serves you progressively longer videos — 45 seconds up to a
hard three-minute cap — and measures whether you actually held them.

## Why it is built this way

Watching longer videos does not, on its own, train attention. A well-made video
holds your attention *for* you; that is its job. So every rep here ends in a
**free-recall prompt**, and the app records **drift events** whenever the tab
loses focus. Those two things are what turn passive watching into an active task,
which is the only form of attention training the evidence actually supports.

Sessions are **five reps and then they stop**. There is no infinite scroll. An
endless feed of longer videos would just be a slower TikTok.

## Setup

```bash
npm install
```

Then get a YouTube key — free tier, about five minutes:

1. [console.cloud.google.com](https://console.cloud.google.com) → new project
2. Enable **YouTube Data API v3**
3. Credentials → Create credentials → API key
4. `cp .env.example .env` and paste the key in

```bash
npm run harvest
```

That fills `public/content/pool.json` from the channel list in
`content/channels.json`. It costs roughly **100 of your 10,000 daily quota units
and zero search calls** — it resolves each channel handle to its uploads playlist
and pages that, rather than using `search.list`, which would burn 100 units *and*
one of only 100 daily search calls per query.

The key stays on your machine. The app itself only ever fetches the static
`pool.json`, so it works offline against whatever it last downloaded.

```bash
npm run dev      # http://localhost:5173
npm test         # ladder + stats logic
npm run build    # static output for Vercel
```

## Structure

| | |
|---|---|
| `scripts/harvest.mjs` | Fills the content pool. The only thing that talks to Google. |
| `src/lib/ladder.ts` | Rung math. Promotion, demotion, what counts as a clean rep. Pure. |
| `src/lib/stats.ts` | Every derived number on the stats page. Pure, `now` injected. |
| `src/lib/store.ts` | Append-only log in `localStorage`. |
| `src/hooks/` | YouTube IFrame wrapper, attention-drift recorder. |
| `src/features/` | Home, Session, Cockpit. |

`ladder.ts` and `stats.ts` are pure functions with 40 tests, because a bug in
either would make every number the app shows a quiet lie.

## The ladder

Rungs: 45, 60, 75, 90, 110, 130, 150, 165, 180 seconds.

A rep counts only if you watched ≥95% of it, drifted for less than 10% of its
length, **and** wrote something from memory afterwards. Three clean reps on
distinct videos moves you up a rung. Two consecutive misses moves you down one —
never more, because one bad day should not erase a week.

Your current rung is *replayed from the log* rather than stored, so there is no
saved value that can fall out of step with your actual history.

## Sync (optional)

Leave it unconfigured and the app runs on `localStorage` alone — the sync UI
does not render at all. Nothing is ever gated behind an account.

To turn it on: create a Supabase project, run `supabase/schema.sql`, enable the
Google provider under Authentication → Providers, and put the project URL and
anon key in `.env` as `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`.

Merging two devices is a set union. Reps are immutable events with
client-generated ids, so there is no update path, nothing to conflict over, and
nothing that can be lost — the merge sorts by time because the ladder replays
the log in order, and breaks ties on id so both devices converge on identical
output.

Row-level security is what protects the data. The anon key is public by design
and safe to ship in the bundle; the Google client secret lives in the Supabase
dashboard and never enters this repo. Your Google OAuth redirect URIs need to
list both your dev origin and your deployed origin, or the callback bounces.

## Notes

- `?seed=200` fills the log with a synthetic six-week history so you can see the
  stats screens populated. `?seed=0` wipes it.
- The player deliberately requires a tap to begin each rep. Browsers block
  unmuted autoplay without a gesture, and muted playback is worthless for videos
  that are someone explaining something.
- If a video fails to load within 8 seconds it is blacklisted and swapped out.
  Some unavailable videos fire no error at all, so silence has to be treated as
  failure or the session hangs on that rep forever.
- 16:9 video in a 9:16 viewport means letterboxing. The bands are used as the
  instrument surround rather than pretended away.
