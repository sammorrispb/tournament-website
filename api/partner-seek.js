/**
 * /api/partner-seek — Submit a "looking for partner" request
 *
 * Proxies through the Hub's partner inquiry system at
 * play.linkanddink.com/api/partner-inquiry with mode "submit_partner_request".
 *
 * POST body:
 *   name      — Player's first name (required)
 *   email     — Player's email for contact (required)
 *   phone     — Phone number (optional)
 *   bracket   — e.g. "3.0-3.5" (required)
 *   eventId   — CourtReserve event calendar ID (required)
 *   location  — "rockville" or "northbethesda" (required)
 *   eventDate — Tournament date ISO string (optional)
 *   message   — Short note (optional, max 200 chars)
 */

const HUB_BASE = process.env.HUB_API_BASE || "https://play.linkanddink.com";
const HUB_JWT = process.env.HUB_SUPABASE_JWT || "";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { name, email, phone, bracket, eventId, location, eventDate, message } = req.body || {};

  if (!name || !email || !bracket || !eventId || !location) {
    return res.status(400).json({
      error: "name, email, bracket, eventId, and location are required",
    });
  }

  if (!["rockville", "northbethesda"].includes(location)) {
    return res.status(400).json({ error: "Invalid location" });
  }

  if (message && message.length > 200) {
    return res.status(400).json({ error: "Message must be 200 characters or less" });
  }

  if (!HUB_JWT) {
    return res.status(503).json({
      error: "Partner matching is not yet available. Check back soon!",
    });
  }

  try {
    const url = `${HUB_BASE}/api/partner-inquiry`;
    const hubRes = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${HUB_JWT}`,
      },
      body: JSON.stringify({
        mode: "submit_partner_request",
        name,
        email,
        phone: phone || null,
        message: message || null,
        cr_event_id: eventId,
        bracket,
        location,
        event_date: eventDate || null,
      }),
    });

    if (!hubRes.ok) {
      const errData = await hubRes.json().catch(() => ({}));
      console.error("Hub partner-seek failed:", hubRes.status, errData);
      return res.status(200).json({
        success: false,
        message: errData.error || "Could not submit request. Please try again.",
      });
    }

    const data = await hubRes.json();
    return res.status(200).json({
      success: true,
      message: "You're on the list! Other players can now see you're looking for a partner.",
      requestId: data.requestId || null,
    });
  } catch (err) {
    console.error("Partner seek submission failed:", err.message);
    return res.status(500).json({
      error: "Failed to submit partner request. Please try again.",
    });
  }
}
