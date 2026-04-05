#!/usr/bin/env node
/**
 * CourtReserve API Endpoint Discovery Script
 *
 * Run locally with your .env credentials to discover which endpoints
 * are available for fetching event registrants.
 *
 * Usage:
 *   1. Create a .env file (or export vars) with your CR credentials:
 *        CR_NB_ORG_ID=10483
 *        CR_NB_USERNAME=your-username
 *        CR_NB_PASSWORD=your-password
 *
 *   2. Run:
 *        node scripts/discover-cr-endpoints.mjs
 *
 *   3. The script will probe candidate endpoints and report which ones work.
 */

import 'dotenv/config';

const CR_BASE = 'https://api.courtreserve.com';

// Use North Bethesda credentials (change to Rockville if needed)
const ORG_ID = process.env.CR_NB_ORG_ID || '10483';
const USERNAME = process.env.CR_NB_USERNAME;
const PASSWORD = process.env.CR_NB_PASSWORD;

if (!USERNAME || !PASSWORD) {
  console.error('❌ Missing credentials. Set CR_NB_USERNAME and CR_NB_PASSWORD environment variables.');
  process.exit(1);
}

const AUTH = Buffer.from(`${USERNAME}:${PASSWORD}`).toString('base64');
const HEADERS = {
  Authorization: `Basic ${AUTH}`,
  'Content-Type': 'application/json',
};

// ─── Step 1: Get a real event ID to test with ───
async function getTestEventId() {
  const startDate = new Date().toISOString().slice(0, 10);
  const end = new Date();
  end.setDate(end.getDate() + 90);
  const endDate = end.toISOString().slice(0, 10);

  const params = new URLSearchParams({ startDate, endDate, organizationId: ORG_ID });
  const url = `${CR_BASE}/api/v1/eventcalendar/eventlist?${params}`;

  console.log('📡 Fetching event list to find a test event...');
  console.log(`   GET ${url}\n`);

  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) {
    console.error(`❌ Event list failed: HTTP ${res.status}`);
    const text = await res.text();
    console.error(text.slice(0, 500));
    process.exit(1);
  }

  const data = await res.json();
  const events = data?.Data || data || [];
  const list = Array.isArray(events) ? events : [];

  if (list.length === 0) {
    console.error('❌ No events found. Check your org ID and date range.');
    process.exit(1);
  }

  // Pick an event with registrations if possible
  const withRegs = list.find(e => (e.RegisteredCount || 0) > 0) || list[0];
  const eventId = withRegs.EventId || withRegs.EventCalendarId || withRegs.Id;
  const eventName = withRegs.EventName || withRegs.Name || 'Unknown';

  console.log(`✅ Found ${list.length} events.`);
  console.log(`   Using: "${eventName}" (ID: ${eventId}, ${withRegs.RegisteredCount || 0} registered)\n`);

  // Also print ALL fields from this event so we can see the data shape
  console.log('── Full event object fields ──');
  for (const [key, value] of Object.entries(withRegs)) {
    const display = typeof value === 'object' ? JSON.stringify(value) : value;
    console.log(`   ${key}: ${display}`);
  }
  console.log('');

  return eventId;
}

// ─── Step 2: Probe candidate registrant endpoints ───
async function probeEndpoints(eventId) {
  const candidates = [
    // Most likely based on CourtReserve's eventcalendar namespace
    `${CR_BASE}/api/v1/eventcalendar/eventregistrations?organizationId=${ORG_ID}&eventCalendarId=${eventId}`,
    `${CR_BASE}/api/v1/eventcalendar/eventregistrations?organizationId=${ORG_ID}&eventId=${eventId}`,
    `${CR_BASE}/api/v1/eventcalendar/registrations?organizationId=${ORG_ID}&eventCalendarId=${eventId}`,
    `${CR_BASE}/api/v1/eventcalendar/registrations?organizationId=${ORG_ID}&eventId=${eventId}`,
    `${CR_BASE}/api/v1/eventcalendar/members?organizationId=${ORG_ID}&eventCalendarId=${eventId}`,
    `${CR_BASE}/api/v1/eventcalendar/members?organizationId=${ORG_ID}&eventId=${eventId}`,
    // Event-scoped paths
    `${CR_BASE}/api/v1/events/${eventId}/registrations?organizationId=${ORG_ID}`,
    `${CR_BASE}/api/v1/events/${eventId}/members?organizationId=${ORG_ID}`,
    `${CR_BASE}/api/v1/events/${eventId}/participants?organizationId=${ORG_ID}`,
    // EventRegistration as a top-level resource
    `${CR_BASE}/api/v1/eventregistration?organizationId=${ORG_ID}&eventCalendarId=${eventId}`,
    `${CR_BASE}/api/v1/eventregistration/list?organizationId=${ORG_ID}&eventCalendarId=${eventId}`,
    // Member-centric
    `${CR_BASE}/api/v1/member/eventregistrations?organizationId=${ORG_ID}&eventCalendarId=${eventId}`,
    // Broader organization-level query
    `${CR_BASE}/api/v1/organization/eventregistrations?organizationId=${ORG_ID}&eventCalendarId=${eventId}`,
  ];

  console.log(`🔍 Probing ${candidates.length} candidate endpoints...\n`);

  const results = [];

  for (const url of candidates) {
    const shortUrl = url.replace(CR_BASE, '');
    try {
      const res = await fetch(url, { headers: HEADERS });
      const status = res.status;

      if (res.ok) {
        const json = await res.json();
        const dataArray = json?.Data || json?.Results || json;
        const count = Array.isArray(dataArray) ? dataArray.length : '?';

        console.log(`   ✅ ${status} ${shortUrl}`);
        console.log(`      → ${count} items returned`);

        // Show first item's keys if available
        const items = Array.isArray(dataArray) ? dataArray : [];
        if (items.length > 0) {
          const keys = Object.keys(items[0]);
          console.log(`      → Fields: ${keys.join(', ')}`);
          console.log(`      → First item sample:`);
          for (const [k, v] of Object.entries(items[0])) {
            const display = typeof v === 'object' ? JSON.stringify(v) : String(v).slice(0, 100);
            console.log(`         ${k}: ${display}`);
          }
        }
        console.log('');

        results.push({ url: shortUrl, status, count, fields: items.length > 0 ? Object.keys(items[0]) : [] });
      } else {
        console.log(`   ❌ ${status} ${shortUrl}`);
      }
    } catch (err) {
      console.log(`   ⚠️  ERR  ${shortUrl} — ${err.message}`);
    }
  }

  console.log('\n══════════════════════════════════════════');
  console.log('SUMMARY');
  console.log('══════════════════════════════════════════');

  if (results.length === 0) {
    console.log('\n❌ No working endpoints found.');
    console.log('   Options:');
    console.log('   1. Check if your org is on Scale or Enterprise plan');
    console.log('   2. Visit https://api.courtreserve.com/swagger/ui/index with your credentials');
    console.log('   3. Contact CourtReserve support for API endpoint documentation');
  } else {
    console.log(`\n✅ ${results.length} working endpoint(s) found:\n`);
    results.forEach((r, i) => {
      console.log(`${i + 1}. ${r.url}`);
      console.log(`   Items: ${r.count} | Fields: ${r.fields.join(', ')}\n`);
    });

    console.log('──────────────────────────────────────────');
    console.log('NEXT STEP: Copy the working endpoint path and update');
    console.log('api/registrants.js with the correct URL pattern.');
    console.log('──────────────────────────────────────────');
  }
}

// ─── Step 3: Also probe the swagger spec URL variants ───
async function probeSwagger() {
  const swaggerUrls = [
    `${CR_BASE}/swagger/v1/swagger.json`,
    `${CR_BASE}/swagger/docs/v1`,
    `${CR_BASE}/api/swagger.json`,
    `${CR_BASE}/apihelp/api`,
  ];

  console.log('\n📄 Checking for accessible Swagger/OpenAPI spec...\n');

  for (const url of swaggerUrls) {
    try {
      const res = await fetch(url, { headers: HEADERS });
      if (res.ok) {
        const text = await res.text();
        console.log(`   ✅ ${url} — ${text.length} bytes`);
        // Try to extract paths if it's JSON
        try {
          const spec = JSON.parse(text);
          if (spec.paths) {
            const eventPaths = Object.keys(spec.paths).filter(
              p => p.toLowerCase().includes('event') || p.toLowerCase().includes('registr')
            );
            if (eventPaths.length > 0) {
              console.log(`\n   🎯 Event/Registration-related API paths found:`);
              eventPaths.forEach(p => console.log(`      ${p}`));
            }
          }
        } catch { /* not JSON */ }
      } else {
        console.log(`   ❌ ${res.status} ${url}`);
      }
    } catch (err) {
      console.log(`   ⚠️  ${url} — ${err.message}`);
    }
  }
}

// ─── Run ───
(async () => {
  console.log('═══════════════════════════════════════════════════');
  console.log(' CourtReserve API Endpoint Discovery');
  console.log(' Org ID: ' + ORG_ID);
  console.log('═══════════════════════════════════════════════════\n');

  try {
    await probeSwagger();
    const eventId = await getTestEventId();
    await probeEndpoints(eventId);
  } catch (err) {
    console.error('Fatal error:', err.message);
    process.exit(1);
  }
})();
