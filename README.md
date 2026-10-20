# New Era Feedback Board

Internal board where World Emblem team leads log feedback, bugs, and process issues about the New Era website. Hosted on GitHub Pages; data, sign-in, and screenshots live in Supabase.

- `CLAUDE.md`: standing rules (fields, statuses, permissions, page behavior)
- `PLAN.md` (build phases) and `reference/board-current.html` (the claude.ai prototype) are kept with the planning files, not in this public repo. Copy them into a local clone if you need them; git ignores them.

## How it fits together

| Part | Where | What it does |
|---|---|---|
| Page | `index.html`, `src/*.ts`, `src/styles.css` | DOM, sign-in, Supabase calls, live updates |
| Board logic | `crates/board-core` (Rust → WebAssembly) | Form rules, filters, grouping, ref numbers, copy-as-text, countdown |
| Database rules | `supabase/schema.sql` | Tables, row level security, triggers, screenshot bucket |
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
3. Create the project, load the schema and the 16 imported items, configure sign-in, and set the GitHub secrets:
   ```sh
   npm run provision -- up --github-secrets
   ```
   It is safe to run again; it reuses the project and skips the schema if it is already there. To set up an existing project instead, add `--ref <project ref>`.

   The 16 imported Teams items (`supabase/seed.sql`, `data/seed-items.json`) are not in this public repo because they hold employee names and internal comments. They are already loaded in Supabase; copies are kept with the original planning files. Put `seed.sql` in `supabase/` before running `up` on a new project.
4. Run locally: `npm run dev`, then open http://localhost:5173/New-Era-Feedback-Board/

## Managing access

Admins (can move and delete) and allowed email domains are database rows:

```sh
npm run provision -- sql -c "insert into public.admins (email) values ('name@worldemblem.com')"
npm run provision -- sql -c "insert into public.allowed_domains (domain) values ('herospride.com')"
npm run provision -- status
```

## Sign-in emails

Until custom SMTP is set up (Supabase dashboard > Authentication > Emails), Supabase only sends sign-in emails to members of your Supabase organization, at most 2 an hour. Set up SMTP before inviting the team.
