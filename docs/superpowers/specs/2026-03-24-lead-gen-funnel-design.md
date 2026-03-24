# Lead Gen Funnel Design Spec

## Problem

The tournament website gets visitors but has no way to capture their info before they leave. Registration links go to CourtReserve, which is a dead end for lead capture. New visitors who are not ready to register have no path to stay connected.

## Solution

A standalone funnel page at /play with a step-by-step quiz wizard that determines the visitor's bracket and social fit, captures their email, and shows personalized event recommendations with live registration links. Leads are sent to the Hub's player pipeline for drip nurturing.

## Two Paths

### New Visitors (7 steps)

| Step | Question | Purpose | Input Type |
|------|----------|---------|------------|
| 1 | Have you played in a Link and Dink tournament before? | Route new vs veteran | 2 cards |
| 2 | How long have you been playing pickleball? | Experience signal | 4 options grid |
| 3 | Which best describes your game? | Skill self-assessment | 4 options list |
| 4 | What matters most to you? Pick up to 2 | Social fit / motivations | 4 options multi-select |
| 5 | Which location works better? | Location preference | 3 options: North Bethesda / Rockville / Either |
| 6 | Name and email | Lead capture gate before results | Text inputs |
| 7 | Personalized results | Bracket, events, specialty recommendations | Results display |

### Returning Players (3 steps)

If Yes at Step 1:

| Step | Question | Purpose |
|------|----------|---------|
| A | Pick your bracket 3.0-3.5, 3.5-4.0, 4.0-4.5 | Direct bracket selection |
| B | Name and email or skip | Lead capture |
| Results | Upcoming events for their bracket | Event listing with Register buttons |

## Scoring Logic

### Bracket Determination

Combines experience (Step 2) and skill self-assessment (Step 3):

| Skill Self-Assessment | Less than 6mo | 6mo to 1yr | 1 to 2yr | 2+ yr |
|----------------------|---------------|------------|----------|-------|
| Still learning basics | Too early | 3.0-3.5 | 3.0-3.5 | 3.0-3.5 |
| Hold rallies consistently | 3.0-3.5 | 3.0-3.5 | 3.0-3.5 | 3.5-4.0 |
| Competitive with strategy | 3.0-3.5 | 3.5-4.0 | 3.5-4.0 | 3.5-4.0 |
| Compete regularly 4.0+ | 3.5-4.0 | 3.5-4.0 | 4.0-4.5 | 4.0-4.5 |

Too early does NOT dead-end the visitor. Instead it shows an encouraging message: "Our tournaments start at 3.0 — keep playing and you will be ready soon!" with open play event links, PLUS an email capture: "Want us to let you know when beginner-friendly events launch?" Name + email fields, same POST to Hub API with bracket: "too-early" so the drip system can nurture them separately.

### Social Fit Tags

From Step 4 motivations:

| Motivation | Specialty Events to Highlight |
|-----------|------------------------------|
| Competitive play | Standard bracket events, higher brackets |
| Meeting new people | Mixed Gender events, community CTAs |
| Improving my game | Player guide link, coaching CTA |
| Fun and community | All specialty events, Circle community CTA |

## Data Flow

Tournament Site /play collects quiz answers + name + email.

POST to play.linkanddink.com/api/tournament-lead sends the lead to the Hub.

The Hub API:
1. Upserts profile in Supabase (email as join key)
2. Stores quiz answers (bracket, motivations, location pref)
3. Tags source as tournament-funnel
4. Triggers drip pipeline (segment-aware)

Results page fetches live events from the tournament site's existing /api/events endpoint, filtered client-side by bracket and location preference. Bracket is extracted from the event name using regex (e.g., matching "3.5-4.0" in "Link and Dink Tournament: 3.5-4.0 (SPRING)") since the API does not return a discrete bracket field.

## Files

### Tournament Website (this repo)

| File | Action | Purpose |
|------|--------|---------|
| play.html | Create | Funnel page with quiz wizard |
| quiz.js | Create | Step wizard logic, scoring, results rendering |
| quiz.css | Create | Wizard styles: progress bar, step transitions, cards |
| index.html | Edit | Hero CTA: Join Link and Dink becomes Find Your Bracket linking to /play |

### The Hub (separate repo at ~/the-hub)

| File | Action | Purpose |
|------|--------|---------|
| api/tournament-lead.js | Create | Receives lead payload, upserts profile, triggers drip |

## API Contract

### POST play.linkanddink.com/api/tournament-lead

Request body:

    {
      "name": "Jane Smith",
      "email": "jane@example.com",
      "bracket": "3.5-4.0",
      "experience": "1-2yr",
      "skillLevel": "competitive-strategy",
      "motivations": ["competitive", "meeting-people"],
      "locationPref": "northbethesda",
      "isVeteran": false,
      "source": "tournament-funnel",
      "completedSteps": 7
    }

Success response:

    {
      "ok": true,
      "profileId": "uuid",
      "bracket": "3.5-4.0"
    }

Error response:

    {
      "ok": false,
      "error": "Invalid email"
    }

CORS: Must allow Origin from the tournament website domain (tournamentwebsite.vercel.app and any custom domain).

## UI Details

### Page Structure

- Header: Link and Dink logo + Find Your Bracket title
- Progress bar: Visual step indicator (filled dots or bar)
- Step container: Animated transitions between steps (slide or fade)
- Back button: On all steps except Step 1
- Mobile-first: All steps designed for phone screens, cards stack vertically

### Results Page (Step 7)

Four sections, each with a colored left border:

1. Your Bracket (green): 3.5-4.0 with brief explanation
2. Recommended Events (purple): 2-3 upcoming tournaments at preferred location from /api/events with Register buttons
3. Need a Partner? (blue): "Don't have a doubles partner? We can help match you." Links to play.linkanddink.com partner request flow
4. Also For You (pink): Specialty events matching social fit (Womens, Mixed, Seniors)
5. Join the Community (yellow): CTA to play.linkanddink.com (Hub) + player guide link

### Styles

- Uses existing tournament site CSS custom properties (--spruce-green, --light-fuschia, etc.)
- Dark background matching the rest of the site
- Cards with hover/active states for selection
- Progress bar uses --light-fuschia for filled state
- Smooth CSS transitions between steps

## Site Navigation Changes

- Homepage hero CTA: Join Link and Dink (linkanddink.com) becomes Find Your Bracket (/play)
- Nav bar: Add Find Your Bracket link
- Spring 2026 page: Add Not sure which bracket? CTA linking to /play

## Funnel Analytics

Track quiz completion and drop-off to measure funnel effectiveness.

The lead POST to the Hub includes a completedSteps count so we know how far each visitor got. Two key events tracked:

1. funnel-start: fires when /play loads (logged via a lightweight GET to /api/tournament-lead?event=start or tracked client-side)
2. funnel-complete: fires on email submit (part of the lead POST payload)

The Hub API stores these as funnel_events on the profile or in a separate analytics table. This gives Sam a simple conversion metric: starts vs completes, plus the ability to see where people drop off by checking completedSteps values.

For v1, this is sufficient. More granular step-by-step tracking can be added later if needed.

## Edge Cases

- Too early result: Visitor with less than 6 months who is still learning. Show encouraging message + open play events + email capture with "notify me when beginner events launch." Lead sent to Hub with bracket: "too-early" for separate nurture track.
- No events for bracket: If /api/events returns no matching events, show Events coming soon with email notification promise.
- Hub API down: Store answers in localStorage and show results anyway. The email is lost but the UX is not broken.
- Duplicate emails: Hub endpoint upserts (updates if exists), does not reject. Updates quiz answers and re-tags source.
- Veteran skip: If a veteran skips the email step, no POST to the Hub API. They see results with Register links but no lead is captured. This is acceptable since they are already in the system.

## Verification

1. Load /play: wizard renders, progress bar visible
2. Complete new visitor path: all 7 steps, bracket scoring matches the matrix
3. Complete veteran fast-track: 3 steps, correct events shown
4. Submit with email: lead appears in Hub Supabase profiles table
5. Results page: live events from /api/events with correct Register links
6. Test too early edge case: gentle redirect message
7. Test on mobile: all steps usable on phone
8. Test Hub API failure: graceful degradation, results still show
9. Homepage hero CTA links to /play
