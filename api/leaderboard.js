import { Client } from "@notionhq/client";

const POINTS = { Gold: 3, Silver: 2, Bronze: 1 };

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const databaseId = process.env.NOTION_DB_MEDAL_LEADERBOARD;
  if (!databaseId) {
    return res.status(500).json({ error: "NOTION_DB_MEDAL_LEADERBOARD not configured" });
  }

  const notion = new Client({ auth: process.env.NOTION_API_KEY });

  try {
    // Fetch all tournament result entries (paginate if >100)
    const entries = [];
    let cursor;
    do {
      const response = await notion.databases.query({
        database_id: databaseId,
        page_size: 100,
        start_cursor: cursor,
      });
      entries.push(...response.results);
      cursor = response.has_more ? response.next_cursor : undefined;
    } while (cursor);

    // Aggregate by player name
    const playerMap = {};
    for (const page of entries) {
      const props = page.properties || {};
      const name = extractProp(props["Player Name"]);
      if (!name) continue;

      const result = (extractProp(props["Result"]) || "").trim();

      if (!playerMap[name]) {
        playerMap[name] = { name, gold: 0, silver: 0, bronze: 0, totalPoints: 0 };
      }

      if (result === "Gold") {
        playerMap[name].gold += 1;
        playerMap[name].totalPoints += POINTS.Gold;
      } else if (result === "Silver") {
        playerMap[name].silver += 1;
        playerMap[name].totalPoints += POINTS.Silver;
      } else if (result === "Bronze") {
        playerMap[name].bronze += 1;
        playerMap[name].totalPoints += POINTS.Bronze;
      }
    }

    const players = Object.values(playerMap);

    // Sort: points desc, then gold > silver > bronze as tiebreakers
    players.sort((a, b) => {
      if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
      if (b.gold !== a.gold) return b.gold - a.gold;
      if (b.silver !== a.silver) return b.silver - a.silver;
      return b.bronze - a.bronze;
    });

    res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=1800");
    return res.status(200).json({ players });
  } catch (err) {
    console.error("Leaderboard fetch failed:", err.message);
    return res.status(500).json({ error: "Failed to fetch leaderboard" });
  }
}

function extractProp(prop) {
  if (!prop) return null;
  switch (prop.type) {
    case "title":
      return prop.title?.map((t) => t.plain_text).join("") || "";
    case "rich_text":
      return prop.rich_text?.map((t) => t.plain_text).join("") || "";
    case "number":
      return prop.number;
    case "select":
      return prop.select?.name || null;
    case "formula":
      return prop.formula?.[prop.formula?.type] ?? null;
    default:
      return null;
  }
}
