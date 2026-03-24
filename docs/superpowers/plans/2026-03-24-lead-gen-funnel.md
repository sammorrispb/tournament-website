# Lead Gen Funnel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a step-by-step quiz funnel at /play on the tournament website that captures visitor email, determines their bracket and social fit, shows personalized event recommendations, and sends leads to the Hub's player pipeline.

**Architecture:** Static HTML page with vanilla JS wizard (no framework). Quiz data submitted via cross-origin POST to the Hub's new /api/tournament-lead endpoint, which upserts a profile in Supabase and queues a welcome digest. Results page pulls live events from the existing /api/events endpoint and filters client-side by bracket.

**Tech Stack:** HTML, CSS, vanilla JS (tournament site); Node.js serverless function + Supabase (Hub)

**Spec:** `docs/superpowers/specs/2026-03-24-lead-gen-funnel-design.md`

---

## File Structure

### Tournament Website (`~/tournament_website/`)

| File | Action | Responsibility |
|------|--------|---------------|
| `play.html` | Create | Funnel page shell: nav, progress bar, step containers, results section |
| `quiz.js` | Create | Wizard state machine: step navigation, answer collection, scoring, API calls, results rendering |
| `quiz.css` | Create | Wizard styles: progress bar, step cards, transitions, mobile layout |
| `index.html` | Edit | Hero CTA change + nav link addition |
| `spring-2026.html` | Edit | Add "Not sure which bracket?" CTA |

### The Hub (`~/the-hub/`)

| File | Action | Responsibility |
|------|--------|---------------|
| `api/tournament-lead.js` | Create | Public endpoint: validate lead, upsert profile, queue welcome digest, log analytics |
| `src/__tests__/tournament-lead.test.js` | Create | Unit tests for lead validation and scoring |

---

## Task 1: Quiz CSS (tournament site)

**Files:**
- Create: `~/tournament_website/quiz.css`

- [ ] **Step 1: Create quiz.css with wizard styles**

Write styles for: progress bar, step container, option cards, selected state, email form, results sections, transitions, mobile responsiveness. Use existing CSS custom properties (--spruce-green, --light-fuschia, --dark-violet, etc.).

```css
/* Key classes needed:
   .quiz-page        — page wrapper with dark bg
   .quiz-header      — logo + "Find Your Bracket" title
   .progress          — step indicator bar
   .progress__dot     — individual dot (filled/empty)
   .step              — step container (hidden by default)
   .step--active      — visible step with fade-in
   .step__question    — question text
   .option-grid       — grid of selectable cards
   .option-card       — individual option (hover, active, selected states)
   .option-card--selected — green border + checkmark
   .multi-select-hint — "pick up to 2" helper text
   .email-form        — name + email inputs + submit
   .results           — results container
   .result-card       — colored left-border card (green/purple/blue/pink/yellow)
   .quiz-back         — back button
   .quiz-nav          — back + next button row
*/
```

Transitions: steps fade in/out with CSS `opacity` + `transform: translateX()`. Progress dots use `--light-fuschia` for filled state. Option cards use `--spruce-green` border on selection. Mobile: single column, full-width cards, min 44px touch targets.

- [ ] **Step 2: Verify in browser**

Open `play.html` (after Task 2) in browser, confirm styles load. Check mobile via dev tools responsive mode.

- [ ] **Step 3: Commit**

```bash
cd ~/tournament_website
git add quiz.css
git commit -m "Add quiz wizard CSS styles for lead gen funnel"
```

---

## Task 2: Quiz HTML Shell (tournament site)

**Files:**
- Create: `~/tournament_website/play.html`
- Modify: `~/tournament_website/index.html` (line 50: hero CTA)
- Modify: `~/tournament_website/spring-2026.html` (add CTA before footer)

- [ ] **Step 1: Create play.html**

Structure:
- Same nav as other pages (copy from spring-2026.html, update active link)
- Quiz header with logo + "Find Your Bracket" h1
- Progress bar (7 dots for new path, collapses for veteran)
- 7 step containers (each with class `step`, only first has `step--active`)
- Step 1: Two cards — "Yes, I'm a veteran" / "No, first time"
- Step 2: 4-option grid — experience duration
- Step 3: 4-option list — skill self-assessment (with description text)
- Step 4: 4-option multi-select grid — motivations
- Step 5: 3 cards — NB / Rockville / Either
- Step 6: Email form — first name + email + submit button
- Step 7: Results container (populated by JS)
- Veteran fast-track steps: A (bracket picker), B (email form with skip)
- "Too early" step: encouraging message + email capture
- Footer (same as other pages)
- Script tags: include BOTH `script.js` (nav/hamburger menu) AND `quiz.js` (wizard logic)
- Link both `styles.css` and `quiz.css`

Each option card uses `data-value` attribute for the answer value. Multi-select step uses `data-max="2"` attribute.

- [ ] **Step 2: Update index.html hero CTA**

Change line 50 from:
```html
<a href="https://www.linkanddink.com" target="_blank" rel="noopener noreferrer" class="btn btn--secondary">Join Link &amp; Dink</a>
```
To:
```html
<a href="play.html" class="btn btn--secondary">Find Your Bracket</a>
```

- [ ] **Step 3: Add nav link to all pages**

In `index.html`, `spring-2026.html`, and `player-guide.html`, add to nav links:
```html
<li><a href="play.html">Find Your Bracket</a></li>
```

- [ ] **Step 4: Add CTA to spring-2026.html**

Before the footer, add:
```html
<section class="section" style="text-align:center;">
  <div class="container">
    <h2>Not Sure Which Bracket?</h2>
    <p style="margin-bottom:1.5rem;">Take our 60-second quiz to find your perfect tournament.</p>
    <a href="play.html" class="btn btn--primary">Find Your Bracket</a>
  </div>
</section>
```

- [ ] **Step 5: Verify in browser**

Open `play.html` — all steps visible in HTML (JS will hide them). Nav works. Links work. Responsive layout correct.

- [ ] **Step 6: Commit**

```bash
cd ~/tournament_website
git add play.html index.html spring-2026.html player-guide.html
git commit -m "Add play.html funnel page shell and update site CTAs"
```

---

## Task 3: Quiz Wizard Logic (tournament site)

**Files:**
- Create: `~/tournament_website/quiz.js`

- [ ] **Step 1: Write quiz state machine**

Core state:
```javascript
var state = {
  currentStep: 1,
  isVeteran: false,
  answers: {
    experience: null,      // "lt6mo" | "6mo1yr" | "1to2yr" | "2plus"
    skill: null,           // "learning" | "consistent" | "competitive" | "tournament"
    motivations: [],       // max 2 from: "competitive" | "social" | "improvement" | "community"
    location: null,        // "northbethesda" | "rockville" | "either"
    bracket: null,         // "3.0-3.5" | "3.5-4.0" | "4.0-4.5" | "too-early"
    name: null,
    email: null,
  },
  completedSteps: 0,
};
```

Functions needed:
- `initQuiz()` — bind click handlers to option cards, show step 1
- `selectOption(stepEl, value)` — mark selected, enable next button
- `toggleMultiSelect(card, max)` — toggle selection, enforce max
- `goToStep(n)` — hide current, show next, update progress bar
- `goBack()` — navigate to previous step
- `determineBracket()` — apply scoring matrix from spec
- `determineSocialFit()` — map motivations to specialty event tags
- `submitLead()` — POST to Hub API, handle success/failure
- `showResults(bracket, events)` — render results section
- `filterEvents(allEvents, bracket, location)` — client-side event filtering by parsing event name regex

- [ ] **Step 2: Implement bracket scoring matrix**

```javascript
var BRACKET_MATRIX = {
  learning:     { lt6mo: "too-early", "6mo1yr": "3.0-3.5", "1to2yr": "3.0-3.5", "2plus": "3.0-3.5" },
  consistent:   { lt6mo: "3.0-3.5",   "6mo1yr": "3.0-3.5", "1to2yr": "3.0-3.5", "2plus": "3.5-4.0" },
  competitive:  { lt6mo: "3.0-3.5",   "6mo1yr": "3.5-4.0", "1to2yr": "3.5-4.0", "2plus": "3.5-4.0" },
  tournament:   { lt6mo: "3.5-4.0",   "6mo1yr": "3.5-4.0", "1to2yr": "4.0-4.5", "2plus": "4.0-4.5" },
};

function determineBracket() {
  return BRACKET_MATRIX[state.answers.skill]?.[state.answers.experience] || "3.0-3.5";
}
```

- [ ] **Step 3: Implement step navigation and veteran branching**

Step 1 "Yes, veteran" -> jump to veteran Step A (bracket picker).
Step 1 "No, first time" -> proceed to Step 2.
Veteran Step A -> Step B (email) -> Results.
New visitor Steps 2-5 -> Step 6 (email) -> Step 7 (results).
"Too early" from scoring -> Too Early step (message + email capture).

- [ ] **Step 4: Implement event filtering for results**

```javascript
function filterEvents(locations, bracket, locationPref) {
  var bracketRegex = new RegExp(bracket.replace("-", "\\s*[-\\u2013]\\s*"));
  var filtered = [];
  locations.forEach(function(loc) {
    if (locationPref !== "either" && loc.location !== locationPref) return;
    loc.events.forEach(function(e) {
      if (bracketRegex.test(e.name)) filtered.push(e);
    });
  });
  return filtered;
}
```

Also detect specialty events for "Also For You" section by checking event names for keywords (women, mixed, senior, junior) and matching against social fit tags.

- [ ] **Step 5: Implement results rendering**

Build results DOM using safe methods (createElement/textContent, same pattern as the existing dynamic leaderboard in script.js). Five sections:
1. Your Bracket (green border)
2. Recommended Events (purple border) — from /api/events, filtered
3. Need a Partner? (blue border) — link to play.linkanddink.com
4. Also For You (pink border) — specialty events matching social fit
5. Join the Community (yellow border) — link to play.linkanddink.com + player guide

Each event in sections 2 and 4 gets a Register button linking to its `registrationUrl`.

- [ ] **Step 6: Implement lead submission**

```javascript
function submitLead() {
  var payload = {
    name: state.answers.name,
    email: state.answers.email,
    bracket: state.answers.bracket,
    experience: state.answers.experience,
    skillLevel: state.answers.skill,
    motivations: state.answers.motivations,
    locationPref: state.answers.location,
    isVeteran: state.isVeteran,
    source: "tournament-funnel",
    completedSteps: state.completedSteps,
  };

  fetch("https://play.linkanddink.com/api/tournament-lead", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).catch(function() {
    // Graceful degradation — show results anyway
  });
}
```

Call submitLead() on email form submit, then immediately show results (don't wait for response). Store answers in localStorage as backup if POST fails.

- [ ] **Step 7: Implement funnel analytics**

Log `completedSteps` increment as user progresses. On page load, increment a simple counter via the existing quiz state. The completedSteps value is included in the lead POST payload.

- [ ] **Step 8: Verify full flow in browser**

Test both paths:
1. New visitor: Steps 1-7, verify bracket matches scoring matrix, verify events filtered correctly
2. Veteran: Steps 1 -> A -> B -> Results
3. Too early: Steps 1 -> 2 -> 3 (learning + lt6mo) -> Too Early page with email capture
4. Test on mobile (dev tools responsive mode)

- [ ] **Step 9: Commit**

```bash
cd ~/tournament_website
git add quiz.js
git commit -m "Add quiz wizard logic with scoring, event filtering, and lead submission"
```

---

## Task 4: Hub Tournament Lead Endpoint

**Files:**
- Create: `~/the-hub/api/tournament-lead.js`
- Create: `~/the-hub/src/__tests__/tournament-lead.test.js`

This task is in a **separate repo** (`~/the-hub/`). It should be done on a feature branch.

- [ ] **Step 1: Write validation tests**

File: `~/the-hub/src/__tests__/tournament-lead.test.js`

```javascript
import { describe, it, expect } from "vitest";
import { validateLeadPayload } from "../utils/tournamentLead.js";

describe("validateLeadPayload", () => {
  it("accepts valid payload", () => {
    const result = validateLeadPayload({
      name: "Jane Smith",
      email: "jane@example.com",
      bracket: "3.5-4.0",
      source: "tournament-funnel",
    });
    expect(result.valid).toBe(true);
  });

  it("rejects missing email", () => {
    const result = validateLeadPayload({ name: "Jane" });
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/email/i);
  });

  it("rejects invalid email format", () => {
    const result = validateLeadPayload({ name: "Jane", email: "not-an-email" });
    expect(result.valid).toBe(false);
  });

  it("accepts too-early bracket", () => {
    const result = validateLeadPayload({
      name: "Jane",
      email: "jane@example.com",
      bracket: "too-early",
      source: "tournament-funnel",
    });
    expect(result.valid).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd ~/the-hub && npx vitest run src/__tests__/tournament-lead.test.js
```

Expected: FAIL — `validateLeadPayload` not found.

- [ ] **Step 3: Create validation utility**

File: `~/the-hub/src/utils/tournamentLead.js`

```javascript
const VALID_BRACKETS = ["3.0-3.5", "3.5-4.0", "4.0-4.5", "too-early"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateLeadPayload(payload) {
  if (!payload) return { valid: false, error: "No payload" };
  if (!payload.email || !EMAIL_RE.test(payload.email)) {
    return { valid: false, error: "Valid email is required" };
  }
  if (payload.bracket && !VALID_BRACKETS.includes(payload.bracket)) {
    return { valid: false, error: "Invalid bracket value" };
  }
  return { valid: true };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd ~/the-hub && npx vitest run src/__tests__/tournament-lead.test.js
```

Expected: PASS

- [ ] **Step 5: Create the API endpoint**

File: `~/the-hub/api/tournament-lead.js`

Pattern: standalone public endpoint (no auth required — anonymous visitors submit leads). Uses `setCorsHeaders` from `api/_lib/cors.js`, service-role Supabase client.

Logic:
1. CORS + OPTIONS handling
2. Validate payload with `validateLeadPayload()`
3. Check if email already exists in profiles (select by email via auth.users join or direct query)
4. If exists: update profile with quiz answers (bracket, motivations, location pref, source tag)
5. If not exists: create Supabase auth user (admin API `createUser`), then insert profile
6. Queue welcome digest item in `digest_queue` with `section_type: "tournament_welcome"` and `section_data` containing bracket, recommended events, partner link
7. Log to `hub_behavior_events` with `event_type: "tournament_lead_received"`
8. Return `{ ok: true, profileId, bracket }`

CORS must allow the tournament website domain. Add `tournamentwebsite.vercel.app` (and any custom domain if configured) to `ALLOWED_ORIGINS` env var on the Hub's Vercel project, or handle it in the endpoint's CORS logic.

- [ ] **Step 6: Commit**

```bash
cd ~/the-hub
git add api/tournament-lead.js src/utils/tournamentLead.js src/__tests__/tournament-lead.test.js
git commit -m "Add tournament lead API endpoint for funnel quiz submissions"
```

---

## Task 5: Integration Testing and Deploy

**Files:**
- No new files — verification of the full flow

- [ ] **Step 1: Test tournament site locally**

```bash
cd ~/tournament_website && npx vercel dev --listen 3000
```

Open http://localhost:3000/play — complete both paths (new visitor + veteran). Verify:
- Progress bar advances
- Back button works
- Bracket scoring matches the matrix
- Events load from /api/events and filter correctly
- Email form validates

- [ ] **Step 2: Deploy Hub endpoint**

```bash
cd ~/the-hub && git push origin main
```

Wait for Vercel auto-deploy. Add `tournamentwebsite.vercel.app` to `ALLOWED_ORIGINS` env var if needed.

- [ ] **Step 3: Test cross-origin lead submission**

From the tournament site (localhost:3000/play), complete the quiz with a test email. Verify:
- POST to play.linkanddink.com/api/tournament-lead succeeds (check Network tab)
- Profile appears in Supabase profiles table
- Digest queue item created with section_type "tournament_welcome"
- Results page shows correctly regardless of API response timing

- [ ] **Step 4: Test edge cases**

- "Too early" path: learning + lt6mo -> encouraging message + email capture -> verify lead sent with bracket "too-early"
- Hub API down: disconnect network -> complete quiz -> verify results still show, answers stored in localStorage
- Duplicate email: submit same email twice -> verify upsert (no error, profile updated)

- [ ] **Step 5: Test on mobile**

Open /play on phone (or dev tools mobile mode). Verify:
- All cards tap-selectable with visible feedback
- Progress bar readable
- Email form keyboard-friendly
- Results scrollable
- Register buttons tappable

- [ ] **Step 6: Deploy tournament site**

```bash
cd ~/tournament_website && git push origin main
```

Vercel auto-deploys. Verify production at tournamentwebsite.vercel.app/play.

- [ ] **Step 7: Commit any fixes from testing**

```bash
cd ~/tournament_website
git add -A && git commit -m "Fix issues found during integration testing"
git push origin main
```

---

## Task Order and Dependencies

```
Task 1 (CSS) ──────────┐
                        ├──> Task 3 (Quiz JS) ──> Task 5 (Integration)
Task 2 (HTML shell) ───┘                              ↑
                                                       │
Task 4 (Hub endpoint) ────────────────────────────────┘
```

Tasks 1, 2, and 4 can be done in parallel. Task 3 depends on 1 and 2. Task 5 depends on 3 and 4.
