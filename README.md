# New Era Feedback Board

Internal board where World Emblem team leads log feedback, bugs, and process issues about the New Era website. Hosted on GitHub Pages; data and screenshots live in Supabase. People get in with a shared team code (no accounts, no emails).

- `CLAUDE.md`: standing rules (fields, statuses, permissions, page behavior)
- `PLAN.md` (build phases) and `reference/board-current.html` (the claude.ai prototype) are kept with the planning files, not in this public repo. Copy them into a local clone if you need them; git ignores them.

## How it fits together

| Part | Where | What it does |
|---|---|---|
| Page | `index.html`, `src/*.ts`, `src/styles.css` | DOM, team code, Supabase calls, live updates |
| Board logic | `crates/board-core` (Rust → WebAssembly) | Form rules, filters, grouping, ref numbers, copy-as-text, countdown |
| Database rules | `supabase/schema.sql`, `supabase/migrations/` | Tables, row level security, triggers, screenshot bucket, team and admin codes, comments |
| Setup tool | `crates/provision` (Rust CLI) | Creates and configures the Supabase project through the Management API |
| Deploy | `.github/workflows/deploy.yml` | Test, build, check for secrets, publish to Pages on every push to `main` |

## First-time setup

1. Install Node 22+, [Rust](https://rustup.rs) (stable), then:
   ```sh
   rustup target add wasm32-unknown-unknown
   cargo install wasm-pack
   npm install
   ```
2. Create a Supabase personal access token at https://supabase.com/dashboard/account/tokens and save it as one line in `~/.supabase/access-token` (Windows: `C:\Users\<you>\.supabase\access-token`). Never commit it.
3. Create the project, load the schema and the 16 imported items, configure access, set the GitHub secrets, then set the codes:
   ```sh
   npm run provision -- up --github-secrets
   npm run provision -- codes
   ```
   It is safe to run again; it reuses the project and skips the schema if it is already there. To set up an existing project instead, add `--ref <project ref>`.

   The 16 imported Teams items (`supabase/seed.sql`, `data/seed-items.json`) are not in this public repo because they hold employee names and internal comments. They are already loaded in Supabase; copies are kept with the original planning files. Put `seed.sql` in `supabase/` before running `up` on a new project.
4. Run locally: `npm run dev`, then open http://localhost:5173/New-Era-Feedback-Board/

## Managing access

- **Team code**: lets a device see the board and submit. Share it in the Teams chat. People enter it once per device.
- **Admin code**: also lets a device move and delete. Give it only to the people who sort items. "Turn off" in the header ends admin mode on that device.
- Codes are not case-sensitive. The database stores only hashes; your copy is in `~/.supabase/<project ref>.board-codes.txt`.
- New codes (for example, if a code gets shared too widely). Everyone then enters the new team code once:
  ```sh
  npm run provision -- codes                                # random words
  npm run provision -- codes --team "..." --admin "..."     # your own (8+ and 12+ characters)
  ```
- `npm run provision -- status` shows how many devices have the team code and how many have admin tools on.
