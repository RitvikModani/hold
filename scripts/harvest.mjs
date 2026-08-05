#!/usr/bin/env node
/**
 * Fills public/content/pool.json with short videos worth paying attention to.
 *
 * Deliberately avoids search.list. Search costs 100 quota units AND draws on a
 * separate allowance of only 100 calls per day, which would make the pool
 * expensive to keep fed. Resolving a handle to its uploads playlist and paging
 * that playlist costs 1 unit per call instead, so a full harvest of twenty
 * channels runs at roughly 1% of the daily quota and touches no search calls.
 *
 * Usage:  YOUTUBE_API_KEY=... node scripts/harvest.mjs [--dry-run]
 *         (or put YOUTUBE_API_KEY in .env)
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const CHANNELS_FILE = path.join(ROOT, 'content', 'channels.json')
const POOL_FILE = path.join(ROOT, 'public', 'content', 'pool.json')
const API = 'https://www.googleapis.com/youtube/v3'

// Kept in step with src/lib/ladder.ts. Duplicated rather than imported because
// this script runs as plain Node with no TypeScript pipeline.
const RUNGS = [45, 60, 75, 90, 110, 130, 150, 165, 180]
const MAX_RUNG_SEC = 180
const MIN_USEFUL_SEC = 36 // the lower edge of the 45s rung's band
const THIN_BUCKET = 20

const DRY_RUN = process.argv.includes('--dry-run')
let unitsSpent = 0

function rungBand(rungSec) {
  return [Math.round(rungSec * 0.85), Math.min(Math.round(rungSec * 1.15), MAX_RUNG_SEC)]
}

/** Minimal .env reader — not worth a dependency for one variable. */
async function loadApiKey() {
  if (process.env.YOUTUBE_API_KEY) return process.env.YOUTUBE_API_KEY
  const envFile = path.join(ROOT, '.env')
  if (existsSync(envFile)) {
    const text = await readFile(envFile, 'utf8')
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^\s*YOUTUBE_API_KEY\s*=\s*(.+?)\s*$/)
      if (m) return m[1].replace(/^["']|["']$/g, '')
    }
  }
  console.error(
    '\nNo YOUTUBE_API_KEY found.\n' +
      '  1. console.cloud.google.com -> new project\n' +
      '  2. Enable "YouTube Data API v3"\n' +
      '  3. Credentials -> Create credentials -> API key\n' +
      '  4. Put YOUTUBE_API_KEY=<key> in rung/.env\n',
  )
  process.exit(1)
}

async function api(endpoint, params, key, cost) {
  const url = new URL(`${API}/${endpoint}`)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  url.searchParams.set('key', key)

  const res = await fetch(url)
  unitsSpent += cost
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`${endpoint} ${res.status}: ${body.slice(0, 300)}`)
  }
  return res.json()
}

/** PT2M13S -> 133. Returns null for anything unparseable. */
function parseDuration(iso) {
  const m = /^P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso ?? '')
  if (!m) return null
  const [, d, h, min, s] = m
  return +(d ?? 0) * 86400 + +(h ?? 0) * 3600 + +(min ?? 0) * 60 + +(s ?? 0)
}

async function uploadsPlaylistId(handle, key) {
  const data = await api('channels', { part: 'contentDetails,snippet', forHandle: handle }, key, 1)
  const item = data.items?.[0]
  if (!item) throw new Error(`handle not found: ${handle}`)
  return { playlistId: item.contentDetails.relatedPlaylists.uploads, title: item.snippet.title }
}

async function recentVideoIds(playlistId, maxPages, key) {
  const ids = []
  let pageToken
  for (let page = 0; page < maxPages; page++) {
    const data = await api(
      'playlistItems',
      { part: 'contentDetails', playlistId, maxResults: '50', ...(pageToken ? { pageToken } : {}) },
      key,
      1,
    )
    for (const it of data.items ?? []) ids.push(it.contentDetails.videoId)
    pageToken = data.nextPageToken
    if (!pageToken) break
  }
  return ids
}

/**
 * Enriches ids with true duration and embed status, then drops everything the
 * app cannot actually play. Filtering here rather than in the browser means a
 * broken video never reaches a session and interrupts a rep.
 */
async function enrich(ids, region, key) {
  const keep = []
  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50)
    const data = await api(
      'videos',
      { part: 'contentDetails,snippet,status', id: batch.join(',') },
      key,
      1,
    )
    for (const v of data.items ?? []) {
      const durationSec = parseDuration(v.contentDetails?.duration)
      if (durationSec === null) continue
      if (durationSec < MIN_USEFUL_SEC || durationSec > MAX_RUNG_SEC) continue
      if (v.status?.embeddable !== true) continue
      if (v.status?.privacyStatus !== 'public') continue
      if (v.snippet?.liveBroadcastContent !== 'none') continue

      const rr = v.contentDetails?.regionRestriction
      if (rr?.blocked?.includes(region)) continue
      if (rr?.allowed && !rr.allowed.includes(region)) continue

      keep.push({
        videoId: v.id,
        durationSec,
        title: v.snippet.title,
        channelTitle: v.snippet.channelTitle,
        channelId: v.snippet.channelId,
        publishedAt: v.snippet.publishedAt,
      })
    }
  }
  return keep
}

/**
 * A video can sit on more than one rung because the bands overlap. That is
 * intended: it keeps thin buckets usable without loosening the duration rules.
 */
function bucket(videos) {
  const rungs = {}
  for (const rung of RUNGS) {
    const [lo, hi] = rungBand(rung)
    rungs[rung] = videos
      .filter((v) => v.durationSec >= lo && v.durationSec <= hi)
      .sort((a, b) => a.videoId.localeCompare(b.videoId))
  }
  return rungs
}

async function main() {
  const key = await loadApiKey()
  const config = JSON.parse(await readFile(CHANNELS_FILE, 'utf8'))
  const region = config.region ?? 'IN'
  const maxPages = config.maxPagesPerChannel ?? 4

  // Anything already harvested stays in, so a channel going quiet never shrinks
  // the pool and a failed run never destroys yesterday's work.
  let existing = []
  if (existsSync(POOL_FILE)) {
    try {
      const prev = JSON.parse(await readFile(POOL_FILE, 'utf8'))
      existing = Object.values(prev.rungs ?? {}).flat()
    } catch {
      console.warn('existing pool.json unreadable, starting fresh')
    }
  }

  const byId = new Map(existing.map((v) => [v.videoId, v]))
  const before = byId.size

  for (const { handle } of config.channels) {
    try {
      const { playlistId, title } = await uploadsPlaylistId(handle, key)
      const ids = await recentVideoIds(playlistId, maxPages, key)
      const fresh = await enrich(ids, region, key)
      let added = 0
      for (const v of fresh) {
        if (!byId.has(v.videoId)) added++
        byId.set(v.videoId, v)
      }
      console.log(
        `  ${title.padEnd(28)} ${String(ids.length).padStart(4)} scanned  ${String(fresh.length).padStart(3)} usable  +${added}`,
      )
    } catch (err) {
      console.warn(`  ${handle.padEnd(28)} FAILED: ${err.message}`)
    }
  }

  const videos = [...byId.values()]
  const pool = { generatedAt: new Date().toISOString(), rungs: bucket(videos) }

  console.log(`\n${videos.length} videos in pool (+${videos.length - before} new)`)
  console.log(`${unitsSpent} of 10,000 daily quota units spent, 0 search calls\n`)

  let thin = false
  for (const rung of RUNGS) {
    const n = pool.rungs[rung].length
    if (n < THIN_BUCKET) thin = true
    console.log(`  ${String(rung).padStart(3)}s  ${String(n).padStart(4)} videos${n < THIN_BUCKET ? '  <-- thin' : ''}`)
  }
  if (thin) {
    console.log(`\nSome rungs hold fewer than ${THIN_BUCKET} videos. Add channels to content/channels.json,`)
    console.log('or raise maxPagesPerChannel to reach further back through their uploads.')
  }

  if (DRY_RUN) {
    console.log('\ndry run — pool.json not written')
    return
  }
  await mkdir(path.dirname(POOL_FILE), { recursive: true })
  await writeFile(POOL_FILE, JSON.stringify(pool, null, 2))
  console.log(`\nwrote ${path.relative(ROOT, POOL_FILE)}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
