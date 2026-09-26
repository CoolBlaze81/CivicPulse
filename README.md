# CivicPulse

Intelligent civic issue management prototype for the fictional **MetroServe Municipal Operations Authority (MSMO)**.
Every report finds its incident. Every incident is tracked until a citizen says it's fixed.

Built from the project documents: Problem Statement, SRS v1.1 (FR-01 to FR-63, BR-01 to BR-12),
DFD Levels 0 to 2, Use Case, Sequence, ER and Class diagrams, and the "Design Foundations v0.1" mockups.

## Run it

Requires **Node.js 20 or newer** (22 or 24 recommended). If `npm install` fails on better-sqlite3, delete `node_modules` and `package-lock.json` and run it again.

```bash
npm install          # installs server and client (npm workspaces)
npm run seed         # builds the demo database (about 100 days of history)
npm run dev          # API on :4000, web app on http://localhost:5173
```

On first start the server seeds itself if the database is empty, so `npm run seed` is only needed to reset the data.

Single-port "production" mode: `npm run build && npm start`, then open http://localhost:4000.

Tests (matching, verification rules, roles, login lockout): `npm test`

## Demo accounts

| Role | Sign in at | ID | Password |
|---|---|---|---|
| Citizen (Aarav Mehta) | `/login` | phone `98765 43210` | the 6-digit code is shown on screen |
| Officer (R. Kapoor, wards 7 to 12) | `/staff/login` | `OFF-101` | `civicpulse` |
| Officer (N. Iyer, wards 1 to 6) | `/staff/login` | `OFF-102` | `civicpulse` |
| Department head, Roads & Highways | `/staff/login` | `DEP-ROADS` (also `DEP-WASTE`, `DEP-ELEC`, `DEP-WATER`, `DEP-WORKS`) | `civicpulse` |
| Field worker, Crew R-4 | `/staff/login` | `CREW-R-4` (every crew has one, e.g. `CREW-E-2`) | `civicpulse` |
| Municipal admin (A. Desai) | `/staff/login` | `ADM-001` | `civicpulse` |

Any other 10-digit mobile number creates a new citizen account.

### A 5-minute demo script

1. **Citizen**: sign in as Aarav. "Needs your check" shows the Lakeview Lane streetlight. Open it, compare before and after, then confirm or reject.
2. **Citizen**: tap *Report an issue* and type "big pothole on ring road". The category is suggested and *This looks already reported* offers to join INC for Deep pothole, Ring Road.
3. **Officer** `OFF-101`: *Incidents* shows the triage queue with CivicPulse's recommended category, priority, department and crew, plus the reasons. Open *Road cave-in near school gate*, then *Assign to Crew R-2 & notify*.
4. **Officer**: *Match review* lists reports scoring 60 to 90%, with distance, category, text and time signals. Link one or create a new incident.
5. **Field worker** `CREW-R-2` (use a phone-sized window): the new job appears. Update progress, add a note and optional photo, then *Mark resolved*. Every reporter gets a 72-hour verification request.
6. **Officer**: *Verification* lists incidents where nobody answered in 72 h. Close one as officer-verified or reopen it. *End window now (demo)* on an incident skips the 72-hour wait.
7. **Department head** `DEP-ROADS`: workload board, crews and equipment, and the categories the department handles (this drives department recommendations).
8. **Admin** `ADM-001`: city analytics (reports per incident, median time to close, reopen rate, duplicates avoided, department workload, by ward).

## How it works

```
client/   React 18 + Vite, React Router, Leaflet (OpenStreetMap tiles)
server/   Node + Express, SQLite (better-sqlite3), JWT sessions, bcrypt, multer for photos
  src/services/   one module per SRS feature (NFR-16)
    reports.js        1.0 Submit & manage reports (validation, IDs)
    matching.js       2.0 Identify & consolidate incidents (MatchingEngine)
    classification.js 3.0 Classify & prioritise (+ department recommendation)
    assignment.js     4.0 Assign department & crew (crew suggestion by ward and load)
    fieldwork.js      5.0 Track resolution (progress, proof)
    verification.js   6.0 Citizen verification (72 h, majority, tie reopens, officer queue)
    notifications.js  7.0 In-app notifications
    analytics.js      8.0 Operational analytics
  src/seed.js     demo data built through the same services
  test/           node:test suite
```

The database schema follows the ER diagram (`server/src/db.js`); the process numbers above match the Level 1 DFD.

### The "intelligent" parts (rule-based, as SRS 2.5 and TBD-03 allow)

- **Duplicate detection** (`matching.js`): open incidents within 300 m are scored on distance (40%), category (25%, half credit for a category in the same department), text similarity (20%, word overlap with synonyms such as "hole" = "pothole") and time gap (15%). **90% or more links automatically (BR-12)**, 60 to 90% goes to officer match review, and below 60% opens a new incident. Different kinds of problem never auto-link. Photo similarity is recorded as "n/a" because image analysis is optional (OR-05).
- **Classification**: keyword rules suggest the category while the citizen types; the majority category of the linked reports wins.
- **Priority**: starts from the category default, becomes P1 on safety words (school, live wire, open manhole, collapse, flood...), goes up a level for wide impact (traffic, main road...) or 5+ reports in 24 h. The reasons are shown to the officer ("Why P1").
- **Department and crew**: department from the category-to-department list that department heads edit; crew is the on-duty crew covering the ward with the most spare capacity.

### Verification rules (BR-10, BR-11, FR-61 to FR-63)

When a crew marks an incident resolved, every citizen with a linked report is asked. The window is 72 hours. The majority of responses decides, and a tie reopens. The outcome is decided early once the remaining answers can no longer change it. With no responses when the window closes, the incident goes to the officer verification queue and closing it there is recorded as **Closed · officer-verified**, counted separately in analytics.

## Decisions where the documents differed

| Topic | Documents | What the app does |
|---|---|---|
| Photo on a report | SRS 4.2.2: optional. Design p.14: required | Optional (SRS wins), with a prompt to add one |
| Citizen login | Design: SMS code. SRS 2.5: SMS out of scope | Phone + 6-digit code shown on screen ("demo mode") |
| Report waiting for match review | Not specified | Report stays unlinked ("Being checked") until an officer decides |
| Citizen taps "Add my report to it" | ER link_method has AUTO / OFFICER / NEW | Added a `CITIZEN` link method so analytics can tell them apart |
| Wards | Not in ER | `incident.ward` from a 12-ward grid over the demo city |
| Who assigns crews | SRS: officer. Design p.31: department board shows "needs a crew" | Officers assign anywhere; department heads can assign crews in their own department |
| Staff login lockout | Design p.28 | 5 wrong passwords lock the account for 15 minutes; admins can unlock |
| Offline queue | Design p.16 only | Not built; a clear offline error keeps the form filled |

## Not in this prototype

Real SMS or email, image similarity, reverse geocoding (citizens type a landmark), offline sending, and deployment/HTTPS set-up (TBD-04). Map tiles and fonts load from the internet.
