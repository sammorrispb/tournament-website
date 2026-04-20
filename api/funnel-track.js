/**
 * Tournament Series — UPJ funnel ingest proxy.
 *
 * Accepts same-origin POSTs from /assets/funnel-client.js, HMAC-signs the
 * payload with FUNNEL_INGEST_SECRET_TOURNAMENTS (server-only env), and
 * forwards to Hub's /api/funnel-event. Pattern mirrors the other marketing
 * sites (sam-morris-website, nextgen-academy, mocopb) but in plain Node
 * serverless (this repo has no TS build step).
 *
 * Secret never reaches the browser. Fail-closed on missing secret
 * (logs and returns 204 so the client never blocks on ingest).
 *
 * Signed string format must match Hub's /api/funnel-event contract:
 *   v1:<timestamp_ms>:<site_id>:<event_type>:<visitor_id>:<email>:<marketing_ref>
 */
import { createHmac } from "node:crypto";

const HUB_ENDPOINT = "https://linkanddink.com/api/funnel-event";
const SITE_ID = "tournaments";
const DEFAULT_MARKETING_REF = "tournaments";

function signFunnelPayload(secret, parts) {
  const signed = `v1:${parts.timestamp}:${parts.siteId}:${parts.eventType}:${parts.visitorId || ""}:${(parts.email || "").toLowerCase()}:${parts.marketingRef || ""}`;
  return createHmac("sha256", secret).update(signed).digest("hex");
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  let body;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
  } catch (_) {
    return res.status(400).json({ error: "invalid json" });
  }

  if (!body.event_type || typeof body.event_type !== "string") {
    return res.status(400).json({ error: "missing event_type" });
  }

  const secret = process.env.FUNNEL_INGEST_SECRET_TOURNAMENTS;
  if (!secret) {
    console.warn("[funnel-track] FUNNEL_INGEST_SECRET_TOURNAMENTS not set — skipping");
    return res.status(204).end();
  }

  const email = body.email ? String(body.email).trim().toLowerCase() : "";
  const visitorId = body.visitor_id ? String(body.visitor_id) : "";
  const marketingRef = body.marketing_ref || DEFAULT_MARKETING_REF;
  const timestamp = Date.now().toString();

  const signature = signFunnelPayload(secret, {
    timestamp,
    siteId: SITE_ID,
    eventType: body.event_type,
    visitorId,
    email,
    marketingRef,
  });

  try {
    const fetchRes = await fetch(HUB_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-funnel-signature": `t=${timestamp},s=${signature}`,
      },
      body: JSON.stringify({
        site_id: SITE_ID,
        event_type: body.event_type,
        visitor_id: visitorId || null,
        email: email || null,
        marketing_ref: marketingRef,
        properties: body.properties ?? null,
      }),
    });
    if (!fetchRes.ok) {
      const text = await fetchRes.text().catch(() => "");
      console.error(`[funnel-track] Hub ingest ${fetchRes.status}: ${text.slice(0, 200)}`);
    }
  } catch (err) {
    console.error("[funnel-track] Hub ingest threw:", err?.message || err);
  }

  return res.status(204).end();
}
