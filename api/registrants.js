const CR_BASE = "https://api.courtreserve.com";

// Location credentials — same as events.js
const LOCATIONS = {
  rockville: {
    orgId: process.env.CR_ROCKVILLE_ORG_ID,
    username: process.env.CR_ROCKVILLE_USERNAME,
    password: process.env.CR_ROCKVILLE_PASSWORD,
  },
  northbethesda: {
    orgId: process.env.CR_NB_ORG_ID,
    username: process.env.CR_NB_USERNAME,
    password: process.env.CR_NB_PASSWORD,
  },
};

// CourtReserve endpoint candidates for event registrations.
// The exact path depends on your org's API version — the first one that
// returns a 2xx wins and is used for all subsequent calls in this request.
const REGISTRANT_ENDPOINTS = [
  (orgId, eventId) =>
    `${CR_BASE}/api/v1/eventcalendar/eventregistrations?organizationId=${orgId}&eventCalendarId=${eventId}`,
  (orgId, eventId) =>
    `${CR_BASE}/api/v1/eventcalendar/registrations?organizationId=${orgId}&eventId=${eventId}`,
  (orgId, eventId) =>
    `${CR_BASE}/api/v1/events/${eventId}/registrations?organizationId=${orgId}`,
];

/**
 * Attempt each candidate endpoint until one succeeds.
 * Returns { data, endpointIndex } or null if all fail.
 */
async function tryEndpoints(orgId, eventId, headers) {
  for (let i = 0; i < REGISTRANT_ENDPOINTS.length; i++) {
    const url = REGISTRANT_ENDPOINTS[i](orgId, eventId);
    try {
      const res = await fetch(url, { headers });
      if (res.ok) {
        const json = await res.json();
        return { data: json, endpointIndex: i };
      }
    } catch {
      // try next endpoint
    }
  }
  return null;
}

/**
 * Normalize whatever shape CourtReserve returns into a clean registrant list.
 * Privacy-friendly: first name + last initial only.
 */
function normalizeRegistrants(raw) {
  const list = raw?.Data || raw?.Results || raw || [];
  const items = Array.isArray(list) ? list : [];

  return items.map((r) => {
    const first =
      r.FirstName || r.MemberFirstName || r.PlayerFirstName || r.Name?.split(" ")[0] || "";
    const last =
      r.LastName || r.MemberLastName || r.PlayerLastName || r.Name?.split(" ").pop() || "";
    const lastInitial = last ? last.charAt(0) + "." : "";

    return {
      name: first ? `${first} ${lastInitial}`.trim() : "Registered Player",
      isWaitlisted: !!(r.IsWaitlisted || r.IsOnWaitlist || r.WaitlistPosition > 0),
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

  const loc = LOCATIONS[location];
  if (!loc || !loc.orgId || !loc.username || !loc.password) {
    return res.status(400).json({ error: "Invalid location or missing credentials" });
  }

  const auth = Buffer.from(`${loc.username}:${loc.password}`).toString("base64");
  const headers = {
    Authorization: `Basic ${auth}`,
    "Content-Type": "application/json",
  };

  try {
    const result = await tryEndpoints(loc.orgId, eventId, headers);

    if (!result) {
      // None of the candidate endpoints worked — return a structured error
      // so the frontend can degrade gracefully
      return res.status(200).json({
        registrants: [],
        supported: false,
        message:
          "Registrant details are not yet available. Check the CourtReserve API docs at api.courtreserve.com/swagger/ui/index for the correct endpoint.",
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
      endpointUsed: REGISTRANT_ENDPOINTS[result.endpointIndex](loc.orgId, eventId),
    });
  } catch (err) {
    console.error("Registrants fetch failed:", err.message);
    return res.status(500).json({ error: "Failed to fetch registrants" });
  }
}
