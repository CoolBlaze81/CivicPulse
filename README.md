# CivicPulse

Intelligent civic issue management prototype for the fictional **MetroServe Municipal Operations Authority (MSMO)**, covering **North Delhi** (12 wards from Jahangirpuri to Civil Lines).
Every report finds its incident. Every incident is tracked until a citizen says it's fixed.

Built from the project documents: Problem Statement, SRS v1.1 (FR-01 to FR-63, BR-01 to BR-12),
DFD Levels 0 to 2, Use Case, Sequence, ER and Class diagrams, and the "Design Foundations v0.1" mockups.

## Run it on your computer

Requires **Node.js 20 or newer** (22 or 24 recommended). Nothing else: the database is an embedded Postgres (PGlite) that lives in `server/data`.

```bash
npm install          # installs server and client (npm workspaces)
npm run dev          # API on :4000, web app on http://localhost:5173
```

The first start loads the demo data (about 100 days of history), which takes around half a minute. `npm run seed` rebuilds it from scratch at any time.

Single-port "production" mode: `npm run build && npm start`, then open http://localhost:4000. This mode also turns on the offline support (service worker).

Tests (matching, verification rules, roles, login limits, photo rule, offline timestamps): `npm test`

### On your phone

Keep the phone on the same Wi-Fi as the computer running `npm run dev`. The terminal prints a `Network:` address such as `http://192.168.1.20:5173`; open it in the phone's browser, then use *Add to Home screen* to get a full-screen CivicPulse icon. If it doesn't load, allow Node through the computer's firewall. Phones only share GPS with HTTPS sites, so over plain Wi-Fi the app uses the demo location. The hosted version below has HTTPS, real GPS and installs like an app.

## Put it online (Vercel + Neon)

The repository is ready for Vercel: `vercel.json` builds the React app as static files and runs the API as one serverless function (`api/index.js`). Data lives in Neon Postgres and photos in Vercel Blob.

1. On vercel.com, **Add New > Project** and import this GitHub repository. Keep the defaults and don't deploy yet if it asks for settings.
2. In the project, open **Storage** and add **Neon** (Postgres). Connect it to the project; this sets `DATABASE_URL`.
3. Optional: in **Storage**, create a **Blob** store and connect it (`BLOB_READ_WRITE_TOKEN`). Without it, photos are kept in Neon and served by the API, which also works.
4. In **Settings > Environment Variables**, add `JWT_SECRET` with a long random value (for example the output of `openssl rand -hex 32`).
5. **Deployments > Redeploy.** The first request after deploying loads the demo data into Neon, so the first page load takes about half a minute.

| Variable | Needed | What it does |
|---|---|---|
| `DATABASE_URL` | on Vercel | Postgres connection string (Neon sets it). Without it the embedded database in `server/data` is used. |
| `BLOB_READ_WRITE_TOKEN` | no | Photo storage in Vercel Blob. Without it (or if Blob fails) photos are kept in the database and served from `/api/photos/<id>`. |
| `JWT_SECRET` | on Vercel | Signs sign-in sessions. Required whenever `NODE_ENV=production`. |
| `VERIFICATION_WINDOW_HOURS` | no | Citizen verification window, default 72. |
| `DEMO_MODE` | no | Set to `0` to hide the "End window now" demo button. |
| `GEOCODE` | no | Set to `0` to turn off address lookup from GPS. |
| `DEMO_RESEED` | no | Set to `0` to stop the server reloading the demo data when it is older than the current version. |
| `REPORTS_PER_HOUR` | no | How many reports one citizen may send an hour, default 10. |

To reset the hosted demo data, run `npm run seed` on your computer with `DATABASE_URL` set to the Neon connection string. It builds the data locally and copies it over in a few seconds.

## Demo accounts

| Role | Sign in at | ID | Password |
|---|---|---|---|
| Citizen (Aarav Mehta) | `/login` | phone `98765 43210` (not shown in the app) | the 6-digit code is shown on screen |
| Officer (R. Kapoor, wards 7 to 12) | `/staff/login` | `OFF-101` | `civicpulse` |
| Officer (N. Iyer, wards 1 to 6) | `/staff/login` | `OFF-102` | `civicpulse` |
| Department head, Roads & Highways | `/staff/login` | `DEP-ROADS` (also `DEP-WASTE`, `DEP-ELEC`, `DEP-WATER`, `DEP-WORKS`) | `civicpulse` |
| Field worker, Crew R-4 | `/staff/login` | `CREW-R-4` (every crew has one, e.g. `CREW-E-2`) | `civicpulse` |
| Municipal admin (A. Desai) | `/staff/login` | `ADM-001` | `civicpulse` |

Any other 10-digit mobile number creates a new citizen account.

### A 5-minute demo script

1. **Citizen**: sign in as Aarav. "Needs your check" shows the Lakeview Lane streetlight. Open it, compare before and after, then confirm or reject.
2. **Citizen**: tap *Report an issue*, add any photo and type "big pothole on ring road". The category is suggested and *This looks already reported* offers to join INC for Deep pothole, Ring Road.
3. **Officer** `OFF-101`: *Incidents* shows the triage queue with CivicPulse's recommended category, priority, department and crew, plus the reasons. Open *Road cave-in near school gate*, then *Assign to Crew R-2 & notify*.
4. **Officer**: *Match review* lists reports scoring 60 to 90%, with distance, category, text and time signals. Link one or create a new incident.
5. **Field worker** `CREW-R-2` (use a phone-sized window): the new job appears. Update progress, add a note and optional photo, then *Mark resolved*. Every reporter gets a 72-hour verification request.
6. **Officer**: *Verification* lists incidents where nobody answered in 72 h. Close one as officer-verified or reopen it. *End window now (demo)* on an incident skips the 72-hour wait.
7. **Department head** `DEP-ROADS`: workload board, crews and equipment, and the categories the department handles (this drives department recommendations).
8. **Admin** `ADM-001`: city analytics (reports per incident, median time to close, reopen rate, duplicates avoided, department workload, by ward).

## What each person sees

- **Citizen** (phone-first, works on a computer too): home with a report button, category shortcuts, their reports, what is happening within 1.5 km, how North Delhi did in the last 30 days and recently fixed problems nearby; a map of open problems with "I see it too"; the report form (photo required, GPS address filled in, duplicate warning before sending, offline queue); updates grouped by day with an icon per kind; a profile with a picture, their impact and account controls.
- **Officer**: an overview of the four queues (triage, match review, needs a crew, officer check) with the most urgent open incidents; the incident list with tabs and search; the incident page in tabs (overview, linked reports, assign, history); match review; the verification queue; analytics; alerts; their own account.
- **Department head**: the workload board (a sideways-swiping board on phones), crews and equipment, the categories they handle, every incident in their department, their own reports and account.
- **Field crew**: today's jobs with distance, the job page with directions, progress stages and resolution proof, alerts, and their own account.
- **Municipal admin**: city analytics, departments, every incident, staff accounts (create, reset a password, switch an account off, unlock) and an activity log.

Every screen is built for phones first and widens to a full-width desktop layout; staff screens swap the navy sidebar for a top bar with a slide-out menu under 800 px, and wide tables become cards instead of scrolling sideways.

## How it works

```
client/   React 18 + Vite, React Router, Leaflet (OpenStreetMap tiles)
server/   Node + Express, Postgres (PGlite locally, Neon hosted), JWT sessions, bcrypt, helmet
api/      Vercel serverless entry for the same Express app
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
  src/services/storage.js  photos: Vercel Blob when hosted, server/uploads locally
  src/services/geocode.js  GPS point to street address (OpenStreetMap Nominatim)
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
| Photo on a report | SRS 4.2.2: optional. Design p.14: required | Required (project decision, following the design). Photos are shrunk on the phone before upload |
| Citizen login | Design: SMS code. SRS 2.5: SMS out of scope | Phone + 6-digit code shown on screen ("demo mode") |
| Report waiting for match review | Not specified | Report stays unlinked ("Being checked") until an officer decides |
| Citizen taps "Add my report to it" | ER link_method has AUTO / OFFICER / NEW | Added a `CITIZEN` link method so analytics can tell them apart |
| Wards | Not in ER | `incident.ward` from a 12-ward grid over North Delhi |
| Who assigns crews | SRS: officer. Design p.31: department board shows "needs a crew" | Officers assign anywhere; department heads can assign crews in their own department |
| Staff login lockout | Design p.28 | 5 wrong passwords lock the account for 15 minutes; admins can unlock |
| Offline queue | Design p.16 only | Built: a report written offline is saved on the phone with its photo and sent when the connection returns, keeping the time it was written |
| Address | Citizens type a landmark | Filled in from the GPS point (OpenStreetMap), and the citizen can edit it |
| Where the demo is set | Not specified | North Delhi: a 4 x 3 ward grid around GTB Nagar, with real locality and street names |

## Not in this prototype

Real SMS or email, and image similarity. Map tiles and fonts load from the internet. Profile pictures and report photos are kept in the database unless a Vercel Blob store is connected.

## Security

- Staff passwords are bcrypt hashed; 5 wrong passwords lock an account for 15 minutes.
- Sign-in codes: 3 tries per code, one code every 30 seconds and five an hour per number, each code works once.
- Rate limits per device on sign-in endpoints and on the API as a whole.
- Security headers (Content-Security-Policy, HSTS on Vercel, nosniff, no framing) via helmet and `vercel.json`.
- A production server refuses to start without `JWT_SECRET`.
- Role checks on every staff endpoint (FR-04, FR-07); department heads only act inside their department.
- Sessions can be ended: changing a password, "sign out on all devices", deleting an account or an admin switching an account off invalidates the tokens already issued.
- Staff can change their own password (8+ characters with a letter and a number); admins can reset one and switch an account off, and neither can lock the last admin out.
- Uploads are checked by their first bytes, not the name or the type the browser claims, so a file that is not really an image is refused.
- One citizen can send at most 10 reports an hour, and can join a given incident only once.
- Sign-ins, failed sign-ins, locked accounts and account changes are written to an activity log admins can read.
