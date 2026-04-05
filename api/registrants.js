/**
 * /api/registrants — Fetch event registrant names via the Hub
 *
 * Instead of calling CourtReserve directly (which requires duplicating
 * credentials), this proxies through the Hub's existing CourtReserve
 * integration at play.linkanddink.com/api/courtreserve.
 *
 * The Hub already syncs CR data and exposes it — we just consume it.
 *
 * Query params:
 *   eventId  — CourtReserve event ID
 *   location — "rockville" or "northbethesda"
 */

const HUB_BASE = process.env.HUB_API_BASE || "https://play.linkanddink.com";

// Hub API key for server-to-server calls (optional — set in Vercel env vars)
const HUB_API_KEY = process.env.HUB_API_KEY || "";

// Location → orgId mapping (public knowledge, used in registration URLs already)
const ORG_IDS = {
  rockville: process.env.CR_ROCKVILLE_ORG_ID || "10869",
  northbethesda: process.env.CR_NB_ORG_ID || "10483",
};

// Candidate action names to try against the Hub's /api/courtreserve endpoint.
// The Hub uses an ACTION_MAP from courtreserve-ops — we try likely names
// until one returns data, then cache which one worked.
const ACTION_CANDIDATES = [
  "event_registrations",
  "event_detail",
  "event_members",
  "registrations",
];

/**
 * Try each action name against the Hub API.
 * Returns { data, action } on first success, or null.
 */
async function tryHubActions(eventId, orgId, headers) {
  for (const action of ACTION_CANDIDATES) {
    const params = new URLSearchParams({
      action,
      eventId,
      organizationId: orgId,
      location: orgId === ORG_IDS.rockville ? "rockville" : "northbethesda",
    });

    const url = `${HUB_BASE}/api/courtreserve?${params}`;

    try {
      const res = await fetch(url, { headers });
      if (!res.ok) continue;

      const json = await res.json();
      // Check if the response has meaningful data (not just an error)
      const items = json?.Data || json?.data || json?.registrants || json?.Results || json;
      if (Array.isArray(items) && items.length > 0) {
        return { data: json, action };
      }
      // If it returned OK but empty array, still mark as supported
      if (Array.isArray(items)) {
        return { data: json, action };
      }
    } catch {
      // try next action
    }
  }
  return null;
}

/**
 * Normalize whatever shape the Hub returns into a clean registrant list.
 * Privacy-friendly: first name + last initial only.
 */
function normalizeRegistrants(raw) {
  // Handle multiple possible response shapes from the Hub
  const list =
    raw?.registrants ||
    raw?.Data ||
    raw?.data ||
    raw?.Results ||
    raw || [];
  const items = Array.isArray(list) ? list : [];

  return items.map((r) => {
    // The Hub or CourtReserve may use various field names
    const first =
      r.firstName || r.FirstName || r.MemberFirstName || r.PlayerFirstName ||
      r.name?.split(" ")[0] || r.Name?.split(" ")[0] || "";
    const last =
      r.lastName || r.LastName || r.MemberLastName || r.PlayerLastName ||
      r.name?.split(" ").pop() || r.Name?.split(" ").pop() || "";
    const lastInitial = last ? last.charAt(0) + "." : "";

    return {
      name: first ? `${first} ${lastInitial}`.trim() : "Registered Player",
      isWaitlisted: !!(
        r.isWaitlisted || r.IsWaitlisted || r.IsOnWaitlist || r.WaitlistPosition > 0
      ),
    };
  });
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { eventId, location } = req.query;

  if (!eventId || !location) {
    return res.status(400).json({ error: "eventId and location are required" });
  }

  const orgId = ORG_IDS[location];
  if (!orgId) {
    return res.status(400).json({ error: "Invalid location" });
  }

  // Build headers for Hub API call
  const headers = { "Content-Type": "application/json" };
  if (HUB_API_KEY) {
    headers["Authorization"] = `Bearer ${HUB_API_KEY}`;
  }

  try {
    const result = await tryHubActions(eventId, orgId, headers);

    if (!result) {
      return res.status(200).json({
        registrants: [],
        waitlisted: [],
        supported: false,
        message:
          "Registrant list not yet available. The Hub's CourtReserve integration may need a matching action configured.",
      });
    }

    const registrants = normalizeRegistrants(result.data);
    const registered = registrants.filter((r) => !r.isWaitlisted);
    const waitlisted = registrants.filter((r) => r.isWaitlisted);

    res.setHeader(
      "Cache-Control",
      "public, s-maxage=3600, stale-while-revalidate=1800"
    );
    return res.status(200).json({
      registrants: registered,
      waitlisted,
      supported: true,
      source: "hub",
      actionUsed: result.action,
    });
  } catch (err) {
    console.error("Registrants fetch via Hub failed:", err.message);
    return res.status(500).json({ error: "Failed to fetch registrants" });
  }
}
