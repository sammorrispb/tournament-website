const CR_BASE = "https://api.courtreserve.com";

const LOCATIONS = {
  rockville: {
    orgId: process.env.CR_ROCKVILLE_ORG_ID,
    username: process.env.CR_ROCKVILLE_USERNAME,
    password: process.env.CR_ROCKVILLE_PASSWORD,
    widgetUrl: "https://widgets.courtreserve.com/Online/Public/EmbedCode/10869/42407",
    label: "Rockville",
  },
  northbethesda: {
    orgId: process.env.CR_NB_ORG_ID,
    username: process.env.CR_NB_USERNAME,
    password: process.env.CR_NB_PASSWORD,
    widgetUrl: "https://widgets.courtreserve.com/Online/Public/EmbedCode/10483/42409",
    label: "North Bethesda",
  },
};

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Fetch 90 days out to cover the full spring season
  const startDate = new Date().toISOString().slice(0, 10);
  const end = new Date();
  end.setDate(end.getDate() + 90);
  const endDate = end.toISOString().slice(0, 10);

  try {
    const results = await Promise.all(
      Object.entries(LOCATIONS).map(async ([key, loc]) => {
        if (!loc.orgId || !loc.username || !loc.password) {
          return { location: key, label: loc.label, events: [], error: "Missing credentials" };
        }

        const params = new URLSearchParams({
          startDate,
          endDate,
          organizationId: loc.orgId,
        });

        const auth = Buffer.from(`${loc.username}:${loc.password}`).toString("base64");
        const headers = {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/json",
        };

        const crRes = await fetch(
          `${CR_BASE}/api/v1/eventcalendar/eventlist?${params}`,
          { headers }
        );

        if (!crRes.ok) {
          return { location: key, label: loc.label, events: [], error: `HTTP ${crRes.status}` };
        }

        const crData = await crRes.json();
        const allEvents = crData?.Data || crData || [];
        const eventList = Array.isArray(allEvents) ? allEvents : [];

        // Filter to Link and Dink tournament events by name or category
        const tournaments = eventList
          .filter((e) => {
            const name = (e.EventName || e.Name || "").toLowerCase();
            const category = (e.EventCategoryName || e.CategoryName || "").toLowerCase();
            return (
              name.includes("link and dink tournament") ||
              name.includes("link & dink tournament") ||
              category.includes("link and dink tournament")
            );
          })
          .filter((e) => !e.IsCanceled)
          .map((e) => {
            const eventId = e.EventId || e.EventCalendarId || e.Id;
            return {
              eventId,
              name: e.EventName || e.Name || "",
              startDateTime: e.StartDateTime || e.StartDate,
              endDateTime: e.EndDateTime || e.EndDate,
              category: e.EventCategoryName || e.CategoryName || "",
              maxRegistrants: e.MaxRegistrants || e.MaxPeople || 0,
              registeredCount: e.RegisteredCount || 0,
              waitlistCount: e.WaitlistCount || 0,
              isFull:
                (e.RegisteredCount || 0) >= (e.MaxRegistrants || e.MaxPeople || 0) &&
                (e.MaxRegistrants || e.MaxPeople || 0) > 0,
              // Direct per-event registration link
              registrationUrl: `https://app.courtreserve.com/Online/Events/Public/${loc.orgId}/${eventId}`,
              // Widget fallback for the full category listing
              widgetUrl: loc.widgetUrl,
              location: loc.label,
            };
          })
          .sort((a, b) => new Date(a.startDateTime) - new Date(b.startDateTime));

        return { location: key, label: loc.label, events: tournaments };
      })
    );

    res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=1800");
    return res.status(200).json({ locations: results });
  } catch (err) {
    console.error("Events fetch failed:", err.message);
    return res.status(500).json({ error: "Failed to fetch events" });
  }
}
