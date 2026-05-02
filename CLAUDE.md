**NOTE (2026-05-02):** This site was decoupled from Dill Dinkers / CourtReserve / The Hub on 2026-05-02. Hub (linkanddink.com) DNS is OFFLINE. The `tournaments.linkanddink.com` subdomain is preserved (Sam owns the parent domain). No DD/CR/Hub references should be re-introduced.

# tournament-website

Static, vanilla-JS marketing + lead-capture site for Sam Morris's Link & Dink tournament series. Deploys to Vercel as a static site (no build step) plus a couple of lightweight serverless functions in `api/`.

## Stack

- Plain HTML / CSS / vanilla JS (no framework, no bundler).
- Two `api/*` Vercel serverless functions:
  - `api/leaderboard.js` — pulls medal-leaderboard rows from Sam's personal Notion DB.
- Vercel Analytics (`/_vercel/insights/script.js`).

## Pages

- `index.html` — current season landing page (schedule, leaderboard, results, FAQ).
- `winter-2026.html` — archived previous-season page.
- `play.html` — interactive bracket-finder quiz (powered by `quiz.js`).
- `player-guide.html` — long-form player guide.
- `spring-2026.html` — meta-redirect to `index.html#schedule`.

## Quiz lead capture

`quiz.js` previously POSTed to a Hub endpoint. As of 2026-05-02 it stashes submissions in `localStorage` (`tournament_lead_backup`) only. Sam reviews leads manually. If a real lead-capture backend is added later, wire it in `submitLead()`.

## Schedule data

The Spring 2026 schedule is hardcoded in `index.html`. Each row links directly to the public CourtReserve event registration URL (`https://app.courtreserve.com/Online/Events/Public/<orgId>/<eventId>`). These URLs are public CR endpoints — they remain functional even though Sam no longer has DD admin access. Update them in HTML when seasons change.

## Required env vars

- `NOTION_API_KEY` — for the leaderboard API.
- `NOTION_DB_MEDAL_LEADERBOARD` — Notion database ID with medal results.
