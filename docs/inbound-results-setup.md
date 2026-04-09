# Inbound Results Pipeline — Operator Setup Checklist

This document covers the one-time setup steps that only a human with
dashboard access can perform. Everything in code (the endpoint, the
Notion schema, the dependencies, the test script, the staff SOP) is
already in place.

**Vercel project:** `tournament-website` (`prj_fn5SvQSIQenqHCB8PbDCbuzb8S6J`)
**Live domain:** `tournaments.linkanddink.com`
**Notion DB:** Medal Points Leaderboard (`7de89f8afc7a46a291c4c14d7fb40300`)
**Git branch for this feature:** `claude/email-results-pipeline`

---

## Step 1 — Create the `tournaments@linkanddink.com` mailbox

Because `linkanddink.com` is on Google Workspace, we can't point the
main domain's MX records at Resend without breaking existing mail.
Instead we verify a subdomain (`inbound.linkanddink.com`) with Resend,
then have Google Workspace forward `tournaments@linkanddink.com` to
the Resend-hosted address.

### Part A — Verify the subdomain in Resend

1. In Resend dashboard → **Domains** → **Add Domain** → enter
   `inbound.linkanddink.com` and choose the **Receiving** (or Inbound)
   purpose if Resend asks.
2. Resend will give you MX records (plus usually a DKIM record). Copy
   them exactly.
3. Log into **GoDaddy** (the DNS is on `ns31/ns32.domaincontrol.com`) →
   My Products → your `linkanddink.com` domain → **DNS** → **Add** →
   add the MX records Resend gave you. The **Name/Host** field should
   be `inbound` (not `@` — that would clobber your Google MX records).
4. Wait ~5–10 minutes for propagation, then click **Verify** in Resend.

### Part B — Create a Resend Inbound route

1. In Resend → **Inbound** (or **Receiving**) → **Add Route**.
2. Set the route to accept mail for `catch-all@inbound.linkanddink.com`
   (or a specific address like `hook@inbound.linkanddink.com` — doesn't
   matter which as long as Google Workspace forwards to it).
3. Leave the webhook URL empty for now — you'll set it in Step 4.

### Part C — Create the Google Workspace group

1. Google Admin console (`admin.google.com`) → **Directory** → **Groups**
   → **Create group**.
2. Group email: `tournaments@linkanddink.com`. Name: "Tournament Results
   Inbox". Description: "Staff-submitted podium results. Forwards to
   Resend for automated leaderboard updates."
3. After creating, open the group → **Access settings** →
   - **Who can join:** Anyone can ask (doesn't matter)
   - **Who can post:** **Anyone on the web** (critical — staff at
     `@dilldinkers.com` are external to `@linkanddink.com` and need to
     be allowed to post).
4. Group → **Members** → **Add member** → add
   `catch-all@inbound.linkanddink.com` (or whatever address you set up
   in Part B) as an **external member**. You may need to enable
   "Allow external members" in the group's settings first.
5. Send a test email from your personal account to
   `tournaments@linkanddink.com` and confirm it's received in Resend
   (Dashboard → Inbound → Logs, or equivalent).

**If Google Workspace blocks external forwarding:** as a fallback,
use a Gmail routing rule instead — Admin console → Apps → Google
Workspace → Gmail → Routing → Add setting. Match recipient
`tournaments@linkanddink.com` and forward to the Resend address.

---

## Step 2 — Configure Resend Inbound webhook

1. In Resend → **Inbound** → the route you just created → **Webhook URL**.
2. Set the URL to:

   ```
   https://tournaments.linkanddink.com/api/inbound-results?secret=<SECRET>
   ```

   Where `<SECRET>` is the same random value you'll set as the
   `INBOUND_WEBHOOK_SECRET` env var in Step 3. Generate one with e.g.
   `openssl rand -hex 32`.
3. Enable the route. Leave retries at whatever Resend defaults to
   (the handler is idempotent-ish for now; true idempotency is a
   follow-up noted in the code).

---

## Step 3 — Set Vercel environment variables

Go to the Vercel dashboard → **tournament-website** project → **Settings** →
**Environment Variables**. Add each of these (scope: Production, Preview,
and Development unless otherwise noted):

| Name | Value | Notes |
|---|---|---|
| `NOTION_API_KEY` | *(create, see Part A below)* | Internal integration token from a new Notion integration. Must be invited to the Medal Points Leaderboard DB. |
| `NOTION_DB_MEDAL_LEADERBOARD` | `7de89f8afc7a46a291c4c14d7fb40300` | Database ID for the Medal Points Leaderboard. |
| `INBOUND_ALLOWED_SENDERS` | `northbethesda@dilldinkers.com,rockville@dilldinkers.com` | Lowercase, comma-separated, no spaces. |
| `INBOUND_WEBHOOK_SECRET` | `bab41be5d36ed003f031520ebaa3c666095c7fdc8711aa2cec240fef60979e51` | Matches the `?secret=` in the Resend webhook URL. Don't reuse elsewhere. |
| `INBOUND_REPLY_FROM` | `tournaments-bot@linkanddink.com` | Must be a verified sender in Resend. See Part B below. |
| `RESEND_API_KEY` | your Resend API key | Used to send auto-replies to staff. From Resend dashboard → API Keys. |
| `BLOB_READ_WRITE_TOKEN` | *(auto-created by Vercel Blob)* | See Step 3. Vercel injects this automatically after you create the Blob store. |

### Part A — Create the Notion integration (one-time)

As of this session, `/api/leaderboard` returns `500 NOTION_DB_MEDAL_LEADERBOARD not configured` — neither Notion env var is set in Vercel yet. Start from scratch:

1. Go to https://www.notion.so/profile/integrations → **New integration**.
2. Name it `Link & Dink Tournament Website`. Associated workspace: the one containing the Medal Points Leaderboard DB. Type: **Internal**. Capabilities: Read content, Update content, Insert content.
3. Copy the **Internal Integration Token** (starts with `secret_` or `ntn_`). This is your `NOTION_API_KEY`.
4. Open the Medal Points Leaderboard database in Notion → **⋯** menu → **Connections** → **Add connections** → search for `Link & Dink Tournament Website` and invite it. This grants the integration access to the DB (Notion integrations only see DBs they've been explicitly invited to).

### Part B — Verify a sending sender in Resend

For auto-replies to work, the `INBOUND_REPLY_FROM` address must be a verified sender. Two paths:

- If you're already verifying `inbound.linkanddink.com` for **receiving** in Step 1, also verify `linkanddink.com` itself for **sending** (separate domain entry in Resend → Domains → Add Domain → choose Sending).
- Or verify `inbound.linkanddink.com` for both send and receive, and change `INBOUND_REPLY_FROM` to `tournaments-bot@inbound.linkanddink.com`.

The first path is cleaner for the staff-facing auto-reply UX.

After saving, **redeploy** the project so the new vars take effect:
Vercel dashboard → Deployments → latest → ⋯ → Redeploy.

---

## Step 4 — Enable Vercel Blob storage for photos

1. Vercel dashboard → **tournament-website** → **Storage** → **Create
   Database** → **Blob**.
2. Name it something like `tournament-photos`. Connect it to the
   `tournament-website` project.
3. Vercel will auto-inject `BLOB_READ_WRITE_TOKEN` into the project's
   env vars — no manual copy-paste needed.
4. Redeploy if Vercel doesn't do it for you automatically.

---

## Step 5 — Local smoke test (optional but recommended)

Before flipping the live webhook over, you can exercise the handler
against a local `vercel dev` server:

```bash
# Terminal 1
vercel link          # if not already linked
vercel env pull .env # pulls the env vars you just set into a local .env
vercel dev           # starts http://localhost:3000

# Terminal 2
export INBOUND_WEBHOOK_SECRET=...   # same as in Vercel
./scripts/test-inbound-results.sh http://localhost:3000
```

The script posts five synthetic webhook payloads (happy path, wrong
sender, bad subject, missing place, Women's Only bracket with
apostrophe normalization) and checks the response status of each.
Accepted rows land in the real Notion DB with `Notes: smoke test — please
delete after review` so they're easy to clean up afterwards.

If you want to test without touching the real Notion DB, make a throwaway
copy of the Medal Points Leaderboard DB and temporarily point
`NOTION_DB_MEDAL_LEADERBOARD` at the copy for local dev only.

---

## Step 6 — Production end-to-end test

Once env vars are set and the deployment is live, send a real email
from one of your allowlisted facility addresses (or temporarily add
your own email to `INBOUND_ALLOWED_SENDERS` to test):

- To: `tournaments@linkanddink.com` (or the inbound subdomain)
- Subject: `Results | 2026-04-11 | 14:30 | North Bethesda | 3.0-3.5`
- Body:
  ```
  1st: Test Player A & Test Player B
  2nd: Test Player C & Test Player D
  3rd: Test Player E & Test Player F

  Teams registered: 1
  Notes: production e2e test — delete after
  ```
- Attach any JPG/PNG.

Within ~2 minutes you should get an "Accepted: …" auto-reply. Open the
Medal Points Leaderboard DB in Notion and confirm:

- 6 new rows created (2 players × 3 medals).
- Each row has Player Name, Result (Gold/Silver/Bronze), Tournament
  Date, Time, Location, Bracket / Level, Partner Name, Source Email,
  Notes, Winner Photo (as an external URL file attachment), and
  Points This Event (3/2/1).

Delete the test rows before the first real tournament. Same for the
five smoke-test rows from Step 5 if you ran them.

---

## Step 7 — Roll out to staff

Only after Steps 1–6 are green:

1. Send the rollout emails (drafted in the earlier conversation — one
   for North Bethesda, one for Rockville) with
   `docs/staff-tournament-results-sop.md` attached.
2. Add a card to your own calendar for ~1 hour after each of the first
   few tournaments as a reminder to spot-check the auto-reply and the
   Notion DB rows that came in.

## Step 8 — Later: re-enable the client leaderboard loader

Currently `script.js:122–125` has the Notion-backed leaderboard loader
commented out, so `index.html` still shows the "Season starts April 11"
placeholder. Once the first real email has flowed through, been
sanity-checked in Notion, and you're happy with the shape of the data,
flip the loader back on.

The full replacement snippet for `script.js:122–125` lives in the
conversation where this pipeline was built — search the branch's PR
description or ask for it again. It calls `/api/leaderboard` (already
deployed) and populates `#leaderboard-body` via `createMedalSpan()`
(already present in `script.js`).

---

## Known gaps to revisit after the first tournament

- **Idempotency.** If Resend retries the webhook (or staff resend the
  email), the handler will create duplicate rows. Add a dedupe check
  on `(Tournament Date, Location, Bracket / Level)` before inserting.
- **Name normalization.** "Jane Doe" vs "jane doe" vs "Jane S. Doe"
  will create separate leaderboard entries. Consider a canonical-name
  formula property in Notion + a one-time cleanup pass.
- **Ties.** The SOP doesn't handle two teams tying for 3rd. If you see
  one, accept it via Notes and have a manager add the tying team
  manually.
- **Photo gallery.** The Winner Photo URL is stored but not rendered
  on the public site yet. A "Latest Results" card on `index.html`
  reading the most-recent 3 distinct tournaments is a natural next
  feature.
- **Manual override endpoint.** If the email flow breaks on a given
  Saturday, you currently have no fast way to enter results. A simple
  password-gated form or a Notion-only workflow is worth building.
