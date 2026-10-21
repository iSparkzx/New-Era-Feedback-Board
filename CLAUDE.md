# New Era Feedback Board

Internal board where World Emblem team leads submit feedback, bugs, and process issues about the New Era website before and after its launch on **Saturday, Nov 7, 2026**. The board owner (Carlos Mitchell) and other board admins sort each item into a status section.

Read `PLAN.md` for the build order. This file is the standing rules. (The repo is public: `PLAN.md`, `reference/`, `supabase/seed.sql`, and `data/` are kept locally and ignored by git. Never commit them.)

## Stack

- Front end: Vite + TypeScript, no UI framework. One page.
- Board logic: Rust in `crates/board-core` (form and comment validation, filters, grouping, ref format, copy-as-text, countdown), compiled to WebAssembly with `wasm-pack` into `src/wasm/` (generated, not committed) and called only through `src/core.ts`. TypeScript does the DOM and Supabase calls. Form rules exist in both `form.rs` and `schema.sql`; keep them in sync (the database is the one that enforces).
- Supabase setup: Rust CLI in `crates/provision` using the Supabase Management API. It reads the personal access token from `SUPABASE_ACCESS_TOKEN` or `~/.supabase/access-token` and never prints it. The database password goes to `~/.supabase/<ref>.db-password`, outside the repo.
- Data, access, file storage: Supabase (Postgres, Auth, Storage, Realtime) via `@supabase/supabase-js` v2.
- Access (Carlos's decision, Oct 20, 2026): no email sign-in. Visitors get a silent Supabase anonymous session and enter a shared **team code** once per device; a separate **admin code** turns on move and delete. Codes are bcrypt hashes in `board_codes`, checked by database functions (`supabase/migrations/002_team_code.sql`).
- Hosting: GitHub Pages, deployed by a GitHub Actions workflow on push to `main`.
- `reference/board-current.html` is the working prototype from claude.ai. Match its behavior and look. Do not copy its `claude.use(...)` calls; those only exist on claude.ai. Replace them with Supabase calls.

## Hard rules

1. **Never commit secrets.** Only the Supabase project URL and the public anon key go in the front end, read from `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. The service role key never appears in this repo, in Actions logs, or in front-end code.
2. **Access control lives in the database.** Row level security in `supabase/schema.sql` and `supabase/migrations/` decides who reads, submits, moves, and deletes. The UI only hides controls; it never enforces. Any new table gets RLS on day one.
3. **Follow the spec exactly.** Do not add, rename, or reorder fields, options, or statuses unless Carlos asks. If something is unclear, stop and ask.
4. **Statuses come from the `statuses` table**, ordered by `sort_order`. Do not hard-code the list in the front end.
5. **Treat all user text as untrusted.** Render with `textContent`, never `innerHTML`. Only render links that start with `http://` or `https://`.
6. **Plain wording in the UI.** Short, direct labels. No jargon.

## The form (exact fields)

| Field | Control | Required | Values / rules |
|---|---|---|---|
| First name | text | yes | 1 to 60 characters |
| Last name | text | yes | 1 to 60 characters |
| Department | dropdown | yes | Marketing, Sales, Customer Service |
| Type | dropdown | yes | Feedback, Bug, Process, Question (Question added at Carlos's request, Oct 21, 2026) |
| Link to the page | text (URL) | no (see PLAN decision D4) | must start with http:// or https:// |
| Description | textarea | yes | 5 to 4000 characters |
| Screenshots | file upload | no | up to 4 images; PNG, JPG, GIF, WebP; 20 MB each; choose, drag, or paste |

New submissions always start in **New**. Remember first name, last name, and department in `localStorage` for the next submission.

## Status sections (in order)

1. New
2. In Review
3. Assigned: Carlos Mitchell
4. Assigned: Corey Frons
5. Assigned: Pierre Colorado
6. Sent to IT
7. Sent to Hanson
8. Disqualified
9. Post Launch Enhancement
10. Done

Every item shows under exactly one section. Moving an item moves it to that section for everyone, live.

## Who can do what

| Person | See items and comments | Submit, comment | Move between sections, change type | Delete items | Delete comments |
|---|---|---|---|---|---|
| Entered the team code on this device (`members`) | yes | yes | no | no | own only |
| Also entered the admin code (`members.is_admin`) | yes | yes | yes | yes | any |
| Anyone else (no code, wrong code) | no | no | no | no | no |

Comments can't be edited. A comment written with admin tools on is marked "Board admin"; the database sets that mark (`comments.by_admin`), so it can't be faked.

Wrong codes are rate-limited in the database (10 per session or 200 overall per 10 minutes). Changing the codes (`npm run provision -- codes`) removes every member, so everyone enters the new team code once. The email-based `allowed_domains` and `admins` paths still exist in the database but email sign-in is turned off.

## Page behavior to keep (from the prototype)

- First visit on a device shows only the "Enter the team code" screen. After that the board opens directly. "Admin tools" in the header asks for the admin code; "Turn off" ends admin mode.
- Countdown banner at the top: "New Era Launching in X days Y hours Z minutes W seconds", live every second, counting to Nov 7, 2026. After that it reads "New Era Launched". (Changed from "Launching in X days Y hours" at Carlos's request, Oct 20, 2026.)
- Ten count tiles, one per section. Clicking a tile shows only that section; clicking again shows all.
- Search box plus Department and Type filters.
- Items grouped under section headings, newest first inside each section. Cards show the ref (NE-01), type, department, status, 3-line description preview, link, small screenshot thumbnails, name, date, and how many comments it has (when it has any).
- Clicking a card opens a side drawer with all details: full description, submitter, department, type, status, link, submitted date, source (Teams import or board), last moved, full-width screenshots, then comments (oldest first) and an "Add a comment" box with "Your name". Admins can change the type, move, and delete from the drawer. Close with button, click outside, or Esc. (Comments and changing the type added at Carlos's request, Oct 21, 2026.)
- Live updates redraw the drawer without clearing a comment being typed. The board also reloads its data when the tab comes back into view, in case the live connection missed something.
- Screenshot thumbnails open a full-size lightbox.
- "Copy shown items as text" button, grouped by section.
- Light and dark themes, works at phone width.

## Data model (see `supabase/schema.sql`)

- `items`: one row per submission. `ref_num` is shown as `NE-` plus two digits minimum (NE-01, NE-17, NE-104). Numbers can skip if an insert fails; that is normal.
- `statuses`: the ten sections.
- `status_events`: written by a trigger every time `items.status` changes.
- `comments`: one row per comment on an item (`supabase/migrations/003_questions_and_comments.sql`). Name 1 to 80 characters, text 1 to 4000. A trigger fills in `by_admin`, `created_by`, and `created_at`. Deleted along with the item.
- `board_codes` (one row, hashes only), `members` (sessions that entered the team code, plus `is_admin`), `code_attempts` (for rate limiting): no client access; changed only by the functions `join_board`, `unlock_admin`, `lock_admin`, `set_board_codes`.
- `admins`, `allowed_domains`: email-based access, kept but unused while email sign-in is off.
- Storage bucket `screenshots` (private). Object path: `<user id>/<random>.<ext>`. Show images with signed URLs.
- Schema changes go in a new numbered file in `supabase/migrations/`, written so it is safe to run again; `provision up` applies every migration each time.

## Commands

Needs Node 22+, Rust stable with the `wasm32-unknown-unknown` target, and `wasm-pack` (`cargo install wasm-pack`).

- `npm install`
- `npm run dev` (local at http://localhost:5173/New-Era-Feedback-Board/, needs `.env.local` with the two `VITE_` values)
- `npm run build` (builds the Wasm core, type-checks, then builds with Vite)
- `npm test` (Rust unit tests for the core and the setup tool)
- `npm run check-secrets` (fails if a secret key or access token is in tracked files or `dist/`)
- `npm run provision -- up --ref ygpwfkzmevitfrpboeqn` (apply schema and migrations, configure access, write `.env.local`; add `--github-secrets` to set the Actions secrets)
- `npm run provision -- codes` (new random team and admin codes; or `--team X --admin Y`). The owner's copy goes to `~/.supabase/<ref>.board-codes.txt`; never put codes in the repo or in chat logs.
- `npm run provision -- status` (health, item count, how many devices have the team code)
- `npm run provision -- sql -c "…"` or `npm run provision -- sql file.sql` (run SQL on the project)
- Deploy: push to `main`; the Actions workflow tests, builds, checks for secrets, and publishes to GitHub Pages.
