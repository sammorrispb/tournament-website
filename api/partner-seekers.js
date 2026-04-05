/**
 * /api/partner-seekers — List players seeking partners for events
 *
 * Proxies through the Hub's partner-seekers endpoint at
 * play.linkanddink.com/api/partner-seekers.
 *
 * Query params:
 *   location  — "rockville" or "northbethesda" (required)
 *   eventId   — CourtReserve event calendar ID (optional)
 *   bracket   — e.g. "3.0-3.5" (optional)
 */

const HUB_BASE = process.env.HUB_API_BASE || "https://play.linkanddink.com";
const HUB_JWT = process.env.HUB_SUPABASE_JWT || "";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { location, eventId, bracket } = req.query;

  if (!location) {
    return res.status(400).json({ error: "location is required" });
  }

  if (!["rockville", "northbethesda"].includes(location)) {
    return res.status(400).json({ error: "Invalid location" });
  }

  if (!HUB_JWT) {
    return res.status(200).json({
      seekers: [],
      supported: false,
      message: "Partner matching coming soon.",
    });
  }

  try {
    const params = new URLSearchParams({ location });
    if (eventId) params.set("eventId", eventId);
    if (bracket) params.set("bracket", bracket);

    const url = `${HUB_BASE}/api/partner-seekers?${params}`;
    const hubRes = await fetch(url, {
      headers: {
        ...(HUB_JWT && { Authorization: `Bearer ${HUB_JWT}` }),
      },
    });

    if (!hubRes.ok) {
      return res.status(200).json({
        seekers: [],
        supported: false,
        message: "Partner matching coming soon.",
      });
    }

    const data = await hubRes.json();

    res.setHeader(
      "Cache-Control",
      "public, s-maxage=300, stale-while-revalidate=120"
    );
    return res.status(200).json({
      seekers: data.seekers || [],
      supported: true,
    });
  } catch (err) {
    console.error("Partner seekers fetch failed:", err.message);
    return res.status(200).json({
      seekers: [],
      supported: false,
      message: "Partner matching coming soon.",
    });
  }
}
