# CivicPulse: analysis of the supplied documents

Sources read: Problem Statement draft, IEEE SRS (FR-01..FR-60, NFR-01..19, BR-01..09, OR-01..05),
design PDF "Design Foundations v0.1" (37 pages: 22 citizen/field-worker phone screens, 13 staff desktop screens),
DFD XML (draw.io, 5 pages: DFD L0/L1/L2, Use Case, Sequence), and the PNG exports of Use Case, L0, L1, L2.

## Actors
| Actor | Where it appears | What they do |
|---|---|---|
| Citizen | all docs | Report (photo + pin + category), track, get notified, verify or reject fixes, "I see it too" on nearby incidents |
| Officer | all docs | Triage incidents, match review (uncertain duplicates), classify/prioritise, assign dept + crew, officer-verify when no citizen responds |
| Department (head) | all docs | Workload board, crews & equipment, which categories the dept handles (drives dept recommendation) |
| Field worker (crew) | all docs | Today's jobs, progress (en route / on site / working / resolved), after-photo proof + note |
| Municipal Admin | Use Case, L1 DFD, design PDF | City analytics, departments, users & roles. **Missing from SRS 2.3 and the L0 DFD** |

## Core lifecycle (one status language, from design p.1)
Reported -> Linked -> Assigned -> In progress -> Awaiting verification -> Closed | Closed (officer-verified) | Reopened -> (reassign)

## Intelligent parts (SRS allows rules, TBD-03)
- Duplicate detection: score from distance, category match, text similarity, photo similarity, time gap. Design: auto-link at >=90%, officer "match review" below that.
- Classification: category suggested from photo (design) / text.
- Priority: P1-P4 with "Why P1" reasons (near school, many reports in short time, ...).
- Department recommendation: category -> department mapping that dept heads edit; crew suggestion by zone and load (e.g. 1/5).

## Update after SRS v1.1 and the fixed DFD (26 Sep 2026)
- Resolved: Municipal Admin is now a user class (item 1), verification rules are BR-10/BR-11/FR-61-63 (item 2), the auto-link threshold is BR-12 (90%), and the fixed DFD renumbers Level 2 per Level 1 process and adds Sequence, ER and Class diagrams (items 4, 5, 8).
- Still open, decided in the app (see README "Decisions where the documents differed"): photo optional vs required, SMS login vs SMS out of scope, offline queue.

## Inconsistencies and gaps (as first found)
1. **Municipal Admin role** is in the use case, L1 DFD and design, but not in SRS user classes, role-based access (NFR-10) or L0 DFD.
2. **Verification rule**: SRS says the reporting citizen confirms or rejects (singular). Design adds: every linked reporter gets 72 h, majority decides, tie reopens, no responses means an officer closes it as "officer-verified". SRS NFR-06 ("not closed until verification succeeded") should mention the officer path.
3. **Citizen login**: design uses mobile number + 6-digit SMS code; SRS 2.5 puts SMS out of scope and FR-01 talks about registration. Needs one answer.
4. **Level 2 DFD numbering** clashes with Level 1: citizen steps are 2.1-2.4 but belong to processes 1.0 and 6.0; the officer's "2.1 Review Incident Identification" reuses 2.1; "4.1" is used by both officer and department. L2 should decompose one L1 process per diagram (e.g. 2.0 -> 2.1, 2.2 ...), not one actor per row.
5. **L1 DFD**: process "7." has no ".0"; notifications only fed by 5.0, though SRS FR-49 wants notifications on receipt, assignment, verification and reopening too. D3 (Users & Departments) only feeds analytics, but 4.0 assignment needs it.
6. **L0 DFD**: labels overlap on the Citizen/Officer arrows; Admin missing.
7. **Design-only features** not in SRS: offline draft queue (p.16), "Nearby" map with "I see it too" (p.8), notification preferences and delete account (p.17), crews/equipment (p.32), account lockout after failed staff logins (p.28), session expiry (p.37).
8. **Field worker vs crew**: SRS talks about individual field workers, design logs in as a crew (Crew R-4). ER/class diagrams listed in SRS Appendix B were not supplied.
9. Photo similarity and "suggested from your photo" imply image analysis, which the SRS makes optional (OR-05).

## Build defaults (until told otherwise)
- Web app: React (Vite) frontend, Node/Express API, SQLite database (one file, no setup).
- Rule-based intelligence: weighted duplicate score (distance, category, text similarity, time), auto-link >= 90%, 60-90% to match review; keyword classification; rule-based priority with reasons; category -> department map; crew suggested by zone + load. No photo similarity.
- Citizen login: mobile + OTP, but the code is shown on screen (demo mode), no real SMS.
- Five roles including Municipal Admin.
- Follow the design PDF's colours, fonts and screens; mobile-first citizen and field-worker UI, desktop staff UI.
- Maps: Leaflet + OpenStreetMap.
- Offline queue: left out of v1.
