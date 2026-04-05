/**
 * /api/registrants — Fetch event registrant names via the Hub
 *
 * Proxies through the Hub's CourtReserve integration at
 * play.linkanddink.com/api/courtreserve, which handles all CR auth
 * internally and enriches registrants with Hub profile data (DUPR, etc).
 *
 * Hub API format:
 *   POST /api/courtreserve
 *   Authorization: Bearer <supabase_jwt>
 *   Body: { action: "getEventRegistrants", location, crEventId }
 *
 * Query params (from tournament site frontend):
 *   eventId  — CourtReserve event calendar ID
 *   location — "rockville" or "northbethesda"
 */

const HUB_BASE = process.env.HUB_API_BASE || "https://play.linkanddink.com";
const HUB_JWT = process.env.HUB_SUPABASE_JWT || "";

/**
 * Fetch enriched registrants from the Hub's getEventRegistrants action.
 * Returns Hub's enriched response or null on failure.
 */
async function fetchRegistrantsFromHub(eventId, location) {
  const url = `${HUB_BASE}/api/courtreserve`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(HUB_JWT && { Authorization: `Bearer ${HUB_JWT}` }),
    },
    body: JSON.stringify({
      action: "getEventRegistrants",
      location,
      crEventId: Number(eventId),
    }),
  });

  if (!res.ok) return null;
  const json = await res.json();
  if (!json.ok) return null;
  return json;
}

/**
 * Fetch waitlisted registrants via the raw CR fallthrough action.
 * The Hub's generic handler passes any ACTION_MAP key through to CR.
 */
async function fetchWaitlistFromHub(eventId, location, startDate) {
  const url = `${HUB_BASE}/api/courtreserve`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(HUB_JWT && { Authorization: `Bearer ${HUB_JWT}` }),
    },
    body: JSON.stringify({
      action: "listWaitlistRegs",
      location,
      params: {
        eventDateFrom: startDate || new Date().toISOString().slice(0, 10) + "T00:00:00",
        eventDateTo: startDate || new Date().toISOString().slice(0, 10) + "T23:59:59",
      },
    }),
  });

  if (!res.ok) return [];
  const json = await res.json();
  const list = json?.Data || json?.data || [];
  return Array.isArray(list) ? list : [];
}

/**
 * Convert Hub's enriched registrant into a privacy-friendly display object.
 * Shows first name + last initial, plus DUPR rating if available.
 */
function formatRegistrant(r) {
  // Use Hub name if available, fall back to CR name
  const fullName = r.hub_name || r.cr_name || "";
  const parts = fullName.split(" ");
  const first = parts[0] || "";
  const last = parts[parts.length - 1] || "";
  const lastInitial = last && last !== first ? last.charAt(0) + "." : "";

  return {
    name: first ? `${first} ${lastInitial}`.trim() : "Registered Player",
    dupr: r.dupr_rating || r.self_rating || null,
    hasHubProfile: !!r.hub_player_id,
  };
}

/**
 * Convert raw CR waitlist entry into display object.
 */
function formatWaitlistEntry(r) {
  const first = r.FirstName || "";
  const last = r.LastName || "";
  const lastInitial = last ? last.charAt(0) + "." : "";

  return {
    name: first ? `${first} ${lastInitial}`.trim() : "Waitlisted Player",
    dupr: null,
    hasHubProfile: false,
  };
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { eventId, location, startDate } = req.query;

  if (!eventId || !location) {
    return res.status(400).json({ error: "eventId and location are required" });
  }

  if (!["rockville", "northbethesda"].includes(location)) {
    return res.status(400).json({ error: "Invalid location" });
  }

  if (!HUB_JWT) {
    return res.status(200).json({
      registrants: [],
      waitlisted: [],
      supported: false,
      message: "Hub authentication not configured. Set HUB_SUPABASE_JWT in environment variables.",
    });
  }

  try {
    // Fetch active registrants (enriched with Hub profiles)
    const hubData = await fetchRegistrantsFromHub(eventId, location);

    if (!hubData) {
      return res.status(200).json({
        registrants: [],
        waitlisted: [],
        supported: false,
        message: "Could not fetch registrants from the Hub. Check Hub API status and JWT.",
      });
    }

    const registrants = (hubData.registrants || []).map(formatRegistrant);

    // Fetch waitlisted players separately (CR uses a different endpoint)
    let waitlisted = [];
    try {
      const waitlistRaw = await fetchWaitlistFromHub(eventId, location, startDate);
      // Filter to this specific event by EventId if present
      const filtered = waitlistRaw.filter(
        (w) => String(w.EventId) === String(eventId) || !w.EventId
      );
      waitlisted = filtered.map(formatWaitlistEntry);
    } catch {
      // Waitlist fetch is best-effort — don't fail the whole request
    }

    res.setHeader(
      "Cache-Control",
      "public, s-maxage=3600, stale-while-revalidate=1800"
    );
    return res.status(200).json({
      registrants,
      waitlisted,
      supported: true,
      source: "hub",
      summary: hubData.summary || null,
    });
  } catch (err) {
    console.error("Registrants fetch via Hub failed:", err.message);
    return res.status(500).json({ error: "Failed to fetch registrants" });
  }
}
