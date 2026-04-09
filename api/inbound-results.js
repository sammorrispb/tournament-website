import { Client as NotionClient } from "@notionhq/client";
import { put as blobPut } from "@vercel/blob";
import { Resend } from "resend";

const NOTION_DB = process.env.NOTION_DB_MEDAL_LEADERBOARD;
const NOTION_KEY = process.env.NOTION_API_KEY;
const ALLOWED_SENDERS = (process.env.INBOUND_ALLOWED_SENDERS || "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);
const INBOUND_SECRET = process.env.INBOUND_WEBHOOK_SECRET;
const REPLY_FROM = process.env.INBOUND_REPLY_FROM || "results-bot@linkanddink.com";
const RESEND_KEY = process.env.RESEND_API_KEY;

// Subject: Results | 2026-04-11 | 14:30 | North Bethesda | 3.0-3.5
const SUBJECT_RE =
  /^Results\s*\|\s*(\d{4}-\d{2}-\d{2})\s*\|\s*(\d{1,2}:\d{2})\s*\|\s*([^|]+?)\s*\|\s*(.+?)\s*$/i;
const PLACE_RE = /^(1st|2nd|3rd)\s*:\s*(.+?)\s*$/i;
const TEAMS_RE = /^Teams registered\s*:\s*(\d+)\s*$/i;
const NOTES_RE = /^Notes\s*:\s*(.*)$/i;

const MEDAL_BY_PLACE = { "1st": "Gold", "2nd": "Silver", "3rd": "Bronze" };
const POINTS_BY_PLACE = { "1st": "3", "2nd": "2", "3rd": "1" };

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (INBOUND_SECRET && req.query.secret !== INBOUND_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const email = normalizePayload(req.body || {});
  const { from, subject, textBody, attachments } = email;

  // 1. Sender allowlist
  if (!ALLOWED_SENDERS.includes(from)) {
    return reject(res, from, subject, `Sender '${from}' is not on the facility allowlist.`);
  }

  // 2. Subject parse
  const m = SUBJECT_RE.exec(subject);
  if (!m) {
    return reject(
      res,
      from,
      subject,
      "Subject line did not match: 'Results | YYYY-MM-DD | HH:MM | Location | Bracket'."
    );
  }
  const [, date, time, locationRaw, bracketRaw] = m;
  const location = normalizeLocation(locationRaw);
  if (!location) {
    return reject(
      res,
      from,
      subject,
      `Location '${locationRaw}' must be 'North Bethesda' or 'Rockville'.`
    );
  }
  const bracket = bracketRaw.trim();

  // 3. Body parse
  const places = { "1st": null, "2nd": null, "3rd": null };
  let teamsRegistered = null;
  let notes = "";
  for (const rawLine of textBody.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    let x;
    if ((x = PLACE_RE.exec(line))) places[x[1].toLowerCase()] = x[2];
    else if ((x = TEAMS_RE.exec(line))) teamsRegistered = Number(x[1]);
    else if ((x = NOTES_RE.exec(line))) notes = x[1];
  }
  for (const p of ["1st", "2nd", "3rd"]) {
    if (!places[p]) {
      return reject(res, from, subject, `Missing '${p}:' line in the email body.`);
    }
  }

  // 4. Photo → Vercel Blob
  let photoUrl = null;
  const photo = attachments.find((a) => (a.contentType || "").startsWith("image/"));
  if (photo) {
    try {
      const filename = `results/${date}-${slug(location)}-${slug(bracket)}.${extFor(photo.contentType)}`;
      const { url } = await blobPut(filename, Buffer.from(photo.content, "base64"), {
        access: "public",
        contentType: photo.contentType,
      });
      photoUrl = url;
    } catch (err) {
      return needsReview(res, from, subject, `Photo upload failed: ${err.message}`);
    }
  }

  // 5. Write to Notion (one row per player per medal). Property names and
  //    types match the existing "Medal Points Leaderboard" database.
  const notion = new NotionClient({ auth: NOTION_KEY });
  const createdRows = [];
  const bracketOption = normalizeBracketForSelect(bracket);
  try {
    for (const place of ["1st", "2nd", "3rd"]) {
      const players = splitPartners(places[place]);
      if (players.length === 0) continue;
      for (const player of players) {
        const partner = players.filter((p) => p !== player).join(" & ");
        const pageProps = {
          "Player Name": titleProp(player),
          "Result": selectProp(MEDAL_BY_PLACE[place]),
          "Points This Event": richTextProp(POINTS_BY_PLACE[place]),
          "Tournament Date": dateProp(date),
          "Time": richTextProp(time),
          "Location": selectProp(location),
          "Bracket / Level": selectProp(bracketOption),
          "Partner Name": richTextProp(partner),
          "Source Email": richTextProp(from),
          "Notes": richTextProp(notes),
        };
        if (photoUrl) {
          pageProps["Winner Photo"] = filesProp(photoUrl, `podium-${date}.${extFor(photo?.contentType || "image/jpeg")}`);
        }
        const page = await notion.pages.create({
          parent: { database_id: NOTION_DB },
          properties: pageProps,
        });
        createdRows.push(page.id);
      }
    }
  } catch (err) {
    return needsReview(res, from, subject, `Could not write to Notion: ${err.message}`);
  }

  await sendAutoReply({
    to: from,
    subject: `Accepted: ${subject}`,
    body: acceptTemplate({
      date,
      time,
      location,
      bracket,
      places,
      photoUrl,
      rowCount: createdRows.length,
      teamsRegistered,
      notes,
    }),
  });

  return res.status(200).json({ status: "accepted", rows: createdRows.length, photoUrl });
}

// ───────── payload adapter ─────────

// Normalize inbound webhook payload to { from, subject, textBody, attachments }.
// Written for Resend Inbound — verify field names against the current docs
// when wiring up the webhook. The shape below handles both a top-level object
// and a { type, data: { ... } } wrapper.
function normalizePayload(body) {
  const d = body?.data || body;
  const fromField = d.from;
  const from =
    (typeof fromField === "string"
      ? fromField
      : fromField?.email || d.From || d.sender || ""
    )
      .match(/<?([^<>\s]+@[^<>\s]+)>?/)?.[1]
      ?.toLowerCase() || "";

  const subject = (d.subject || d.Subject || "").trim();
  const textBody = d.text || d.TextBody || d.plain || "";
  const rawAttachments = d.attachments || d.Attachments || [];
  const attachments = rawAttachments.map((a) => ({
    filename: a.filename || a.Name || "",
    contentType: a.content_type || a.contentType || a.ContentType || "",
    content: a.content || a.Content || "",
  }));
  return { from, subject, textBody, attachments };
}

// ───────── helpers ─────────

function normalizeLocation(raw) {
  const v = raw.trim().toLowerCase();
  if (v === "north bethesda" || v === "nb") return "North Bethesda";
  if (v === "rockville" || v === "rv") return "Rockville";
  return null;
}

function splitPartners(line) {
  return line
    .split(/\s*&\s*/)
    .map((s) => s.trim())
    .filter((s) => s && s !== "—" && s !== "-");
}

function slug(s) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function extFor(ct) {
  if (ct === "image/jpeg") return "jpg";
  if (ct === "image/png") return "png";
  if (ct === "image/webp") return "webp";
  return "bin";
}

const titleProp = (text) => ({ title: [{ text: { content: text } }] });
const richTextProp = (text) => ({ rich_text: [{ text: { content: text || "" } }] });
const selectProp = (name) => ({ select: { name } });
const dateProp = (iso) => ({ date: { start: iso } });
const filesProp = (href, name) => ({
  files: [{ type: "external", name, external: { url: href } }],
});

// The Notion "Bracket / Level" select options don't include the apostrophe
// in "Women's Only" (DDL parsing constraint). Staff can still write "Women's"
// naturally in the email — we normalize before lookup.
function normalizeBracketForSelect(bracket) {
  return bracket.replace(/Women'?s/gi, "Womens");
}

async function reject(res, from, subject, reason) {
  await sendAutoReply({
    to: from,
    subject: `Rejected: ${subject || "(no subject)"}`,
    body: rejectTemplate(reason),
  });
  return res.status(200).json({ status: "rejected", reason });
}

async function needsReview(res, from, subject, reason) {
  await sendAutoReply({
    to: from,
    subject: `Needs review: ${subject || "(no subject)"}`,
    body: needsReviewTemplate(reason),
  });
  return res.status(200).json({ status: "needs_review", reason });
}

async function sendAutoReply({ to, subject, body }) {
  if (!RESEND_KEY || !to) {
    console.log(`[auto-reply skipped] → ${to}: ${subject}\n${body}`);
    return;
  }
  try {
    const resend = new Resend(RESEND_KEY);
    await resend.emails.send({
      from: REPLY_FROM,
      to,
      subject,
      text: body,
    });
  } catch (err) {
    console.error("Auto-reply send failed:", err.message);
  }
}

function acceptTemplate({
  date,
  time,
  location,
  bracket,
  places,
  photoUrl,
  rowCount,
  teamsRegistered,
  notes,
}) {
  return [
    `Your tournament results were published to the Spring 2026 leaderboard.`,
    ``,
    `  Date:     ${date} ${time}`,
    `  Location: ${location}`,
    `  Bracket:  ${bracket}`,
    `  1st:      ${places["1st"]}`,
    `  2nd:      ${places["2nd"]}`,
    `  3rd:      ${places["3rd"]}`,
    `  Teams:    ${teamsRegistered ?? "(not provided)"}`,
    `  Photo:    ${photoUrl || "(none)"}`,
    `  Notes:    ${notes || "(none)"}`,
    `  Notion rows created: ${rowCount}`,
    ``,
    `The public leaderboard refreshes within ~5 minutes. Reply to this email`,
    `if anything looks wrong and a manager will correct it.`,
  ].join("\n");
}

function rejectTemplate(reason) {
  return [
    `Your results email could NOT be published. Reason:`,
    ``,
    `  ${reason}`,
    ``,
    `Please fix and resend. Quick reference:`,
    ``,
    `  Subject: Results | YYYY-MM-DD | HH:MM | Location | Bracket`,
    `  Body:`,
    `    1st: Player A & Player B`,
    `    2nd: Player C & Player D`,
    `    3rd: Player E & Player F`,
    `    Teams registered: N`,
    `    Notes: (optional)`,
    ``,
    `The email must come from the facility's official email address.`,
    `See the full SOP on the staff clipboard or in docs/staff-tournament-results-sop.md.`,
  ].join("\n");
}

function needsReviewTemplate(reason) {
  return [
    `Your results were received but need a human check before publishing:`,
    ``,
    `  ${reason}`,
    ``,
    `A manager has been notified and will publish manually within a few hours.`,
    `No action needed from you — the leaderboard will update automatically once`,
    `they finish.`,
  ].join("\n");
}
