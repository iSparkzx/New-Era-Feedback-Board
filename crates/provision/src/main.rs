//! Sets up the Supabase project for the New Era Feedback Board through the
//! Supabase Management API (https://api.supabase.com).
//!
//!   cargo run -p provision -- up       create or reuse the project, apply SQL, configure sign-in
//!   cargo run -p provision -- sql FILE run a SQL file on the project named in .env.local
//!   cargo run -p provision -- status   show project health and item count
//!
//! The access token comes from SUPABASE_ACCESS_TOKEN or ~/.supabase/access-token.
//! It is never printed. Secret and service-role keys are never read or written.

use std::fs;
use std::io::Write as _;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::thread::sleep;
use std::time::{Duration, Instant};

use reqwest::blocking::Client;
use reqwest::Method;
use serde_json::{json, Value};

const API: &str = "https://api.supabase.com";
const DEFAULT_NAME: &str = "New-Era-Feedback-Board";
const DEFAULT_REGION: &str = "us-east-1";
const DEFAULT_SITE: &str = "https://isparkzx.github.io/New-Era-Feedback-Board/";
const LOCAL_DEV: &str = "http://localhost:5173/";
const GITHUB_REPO: &str = "iSparkzx/New-Era-Feedback-Board";

const EMAIL_SUBJECT: &str = "Your sign-in link for the New Era Feedback Board";
const EMAIL_BODY: &str = r#"<h2>Sign in to the New Era Feedback Board</h2>
<p><a href="{{ .ConfirmationURL }}">Sign in</a></p>
<p>This link works once and expires in 1 hour. If you did not ask to sign in, you can ignore this email.</p>"#;

type Result<T> = std::result::Result<T, String>;

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let result = match args.first().map(String::as_str) {
        Some("up") => Options::parse(&args[1..]).and_then(|o| up(&o)),
        Some("sql") => sql_command(&args[1..]),
        Some("status") => status(),
        Some("list") => list(),
        _ => {
            eprintln!("{}", USAGE);
            std::process::exit(2);
        }
    };
    if let Err(e) = result {
        eprintln!("\nError: {e}");
        std::process::exit(1);
    }
}

const USAGE: &str = "Usage:
  provision up [--ref PROJECT_REF | --org SLUG] [--name NAME] [--region CODE]
               [--site-url URL] [--allow-paid] [--github-secrets]
               (--ref sets up an existing project and renames it to NAME)
  provision sql FILE            run a SQL file on the project in .env.local
  provision sql -c \"SQL\"        run one SQL statement
  provision status              health and counts for the project in .env.local
  provision list                your organizations and projects (read only)";

struct Options {
    /// Set up this existing project instead of finding or creating one.
    project_ref: Option<String>,
    org: Option<String>,
    name: String,
    region: String,
    site_url: String,
    allow_paid: bool,
    github_secrets: bool,
}

impl Options {
    fn parse(args: &[String]) -> Result<Self> {
        let mut o = Options {
            project_ref: None,
            org: None,
            name: DEFAULT_NAME.into(),
            region: DEFAULT_REGION.into(),
            site_url: DEFAULT_SITE.into(),
            allow_paid: false,
            github_secrets: false,
        };
        let mut it = args.iter();
        while let Some(a) = it.next() {
            let mut value = || it.next().cloned().ok_or(format!("{a} needs a value"));
            match a.as_str() {
                "--ref" => o.project_ref = Some(value()?),
                "--org" => o.org = Some(value()?),
                "--name" => o.name = value()?,
                "--region" => o.region = value()?,
                "--site-url" => o.site_url = value()?,
                "--allow-paid" => o.allow_paid = true,
                "--github-secrets" => o.github_secrets = true,
                other => return Err(format!("unknown option {other}\n\n{USAGE}")),
            }
        }
        if !o.site_url.ends_with('/') {
            o.site_url.push('/');
        }
        Ok(o)
    }
}

// ---------------------------------------------------------------------------
// Management API client
// ---------------------------------------------------------------------------

struct Api {
    http: Client,
    token: String,
}

impl Api {
    fn new() -> Result<Self> {
        let token = match std::env::var("SUPABASE_ACCESS_TOKEN") {
            Ok(t) if !t.trim().is_empty() => t,
            _ => {
                let path = home()?.join(".supabase").join("access-token");
                fs::read_to_string(&path).map_err(|_| {
                    format!(
                        "No Supabase access token. Create one at https://supabase.com/dashboard/account/tokens \
                         and save it as one line in {}",
                        path.display()
                    )
                })?
            }
        };
        // Notepad can add a byte-order mark; it isn't whitespace, so strip it too.
        let token = token.trim().trim_start_matches('\u{feff}').trim().to_string();
        if !token.starts_with("sbp_") {
            return Err("The saved access token doesn't look like a Supabase personal access token (it should start with sbp_).".into());
        }
        let http = Client::builder()
            .timeout(Duration::from_secs(120))
            .user_agent("new-era-feedback-board-provision")
            .build()
            .map_err(|e| e.to_string())?;
        Ok(Api { http, token })
    }

    /// Calls the API. When `quiet` is set, the response body is never echoed
    /// in errors (used for calls whose responses can hold keys).
    fn call(&self, method: Method, path: &str, body: Option<&Value>, quiet: bool) -> Result<Value> {
        let mut req = self.http.request(method.clone(), format!("{API}{path}")).bearer_auth(&self.token);
        if let Some(b) = body {
            req = req.json(b);
        }
        let res = req.send().map_err(|e| format!("Could not reach the Supabase API ({method} {path}): {e}"))?;
        let code = res.status();
        let text = res.text().unwrap_or_default();
        if !code.is_success() {
            let detail = if quiet { String::new() } else { format!(": {}", short(&text)) };
            let hint = match code.as_u16() {
                401 => " (the access token is wrong or expired)",
                403 => " (the access token isn't allowed to do this)",
                429 => " (too many requests; wait a minute and run it again)",
                _ => "",
            };
            return Err(format!("{method} {path} failed with {code}{hint}{detail}"));
        }
        if text.trim().is_empty() {
            return Ok(Value::Null);
        }
        serde_json::from_str(&text).map_err(|e| format!("{method} {path}: unexpected response ({e})"))
    }

    fn get(&self, path: &str) -> Result<Value> {
        self.call(Method::GET, path, None, false)
    }

    fn query(&self, project: &str, sql: &str) -> Result<Value> {
        self.call(
            Method::POST,
            &format!("/v1/projects/{project}/database/query"),
            Some(&json!({ "query": sql })),
            false,
        )
    }
}

fn short(text: &str) -> String {
    let t = text.trim();
    if t.chars().count() > 600 {
        format!("{}…", t.chars().take(600).collect::<String>())
    } else {
        t.to_string()
    }
}

fn home() -> Result<PathBuf> {
    std::env::var_os("USERPROFILE")
        .or_else(|| std::env::var_os("HOME"))
        .map(PathBuf::from)
        .ok_or_else(|| "Can't find your home folder".to_string())
}

fn repo_root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("..").join("..")
}

fn str_of<'a>(v: &'a Value, key: &str) -> &'a str {
    v.get(key).and_then(Value::as_str).unwrap_or("")
}

// ---------------------------------------------------------------------------
// up
// ---------------------------------------------------------------------------

fn up(o: &Options) -> Result<()> {
    let api = Api::new()?;
    let root = repo_root();
    let schema = read(&root.join("supabase/schema.sql"))?;
    // seed.sql is kept out of git (it holds employee names), so it may be missing.
    let seed = fs::read_to_string(root.join("supabase/seed.sql")).ok();

    let project = match &o.project_ref {
        Some(r) => use_existing(&api, r, &o.name)?,
        None => find_or_create(&api, o)?,
    };

    wait_until_healthy(&api, &project)?;

    step("Applying database schema");
    let present = api.query(&project, "select to_regclass('public.items') is not null as present")?;
    if present.pointer("/0/present").and_then(Value::as_bool) == Some(true) {
        println!("  Already applied; leaving schema.sql alone");
    } else {
        api.query(&project, &schema)?;
        println!("  Applied supabase/schema.sql");
    }

    step("Loading the 16 imported items");
    match &seed {
        Some(sql) => {
            api.query(&project, sql)?;
        }
        None => println!("  No supabase/seed.sql here (it is kept out of git); skipping"),
    }
    let count = api.query(&project, "select count(*)::int as n from public.items")?;
    println!("  items: {}", count.pointer("/0/n").and_then(Value::as_i64).unwrap_or(-1));

    step("Configuring sign-in");
    let allow = format!("{}**,{}**", o.site_url, LOCAL_DEV);
    let auth_path = format!("/v1/projects/{project}/config/auth");
    // Error replies here are validation messages about what we sent; safe to show.
    api.call(
        Method::PATCH,
        &auth_path,
        Some(&json!({
            "site_url": o.site_url,
            "uri_allow_list": allow,
            "disable_signup": false,
            "external_email_enabled": true,
            "external_anonymous_users_enabled": false,
            "mailer_autoconfirm": false,
            "mailer_otp_exp": 3600,
        })),
        false,
    )?;
    println!("  Site URL: {}", o.site_url);
    println!("  Redirects allowed: {allow}");
    println!("  Email confirmation: on");

    // Supabase only allows custom email wording once custom SMTP is set up.
    let wording = api.call(
        Method::PATCH,
        &auth_path,
        Some(&json!({
            "mailer_subjects_magic_link": EMAIL_SUBJECT,
            "mailer_subjects_confirmation": EMAIL_SUBJECT,
            "mailer_templates_magic_link_content": EMAIL_BODY,
            "mailer_templates_confirmation_content": EMAIL_BODY,
        })),
        false,
    );
    match wording {
        Ok(_) => println!("  Sign-in email wording: set"),
        Err(_) => println!("  Sign-in email wording: left as Supabase's default (needs custom SMTP; run `up` again after setting it up)"),
    }

    step("Reading the public (publishable) key");
    let key = public_key(&api, &project)?;
    let url = format!("https://{project}.supabase.co");
    let env_path = root.join(".env.local");
    fs::write(
        &env_path,
        format!(
            "# Written by `cargo run -p provision -- up`. Do not commit.\n\
             VITE_SUPABASE_URL={url}\n\
             VITE_SUPABASE_ANON_KEY={key}\n"
        ),
    )
    .map_err(|e| format!("Could not write {}: {e}", env_path.display()))?;
    println!("  Wrote .env.local");

    if o.github_secrets {
        step("Saving GitHub Actions secrets");
        github_secret("VITE_SUPABASE_URL", &url)?;
        github_secret("VITE_SUPABASE_ANON_KEY", &key)?;
        println!("  Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY on {GITHUB_REPO}");
    }

    println!("\nDone.");
    println!("  Project:   {url}");
    println!("  Dashboard: https://supabase.com/dashboard/project/{project}");
    println!("\nStill to do by hand:");
    println!("  - Set up custom SMTP (Authentication > Emails). Until then Supabase only emails members");
    println!("    of your Supabase organization, at most 2 emails an hour.");
    println!("  - Add admins:  cargo run -p provision -- sql -c \"insert into public.admins (email) values ('name@worldemblem.com')\"");
    Ok(())
}

/// Checks the project exists and renames it to `name` (a failed rename is only a warning).
fn use_existing(api: &Api, project: &str, name: &str) -> Result<String> {
    step("Using an existing project");
    let p = api.get(&format!("/v1/projects/{project}"))?;
    let current = str_of(&p, "name");
    println!("  \"{current}\" ({project}, {})", str_of(&p, "region"));
    if current != name {
        match api.call(Method::PATCH, &format!("/v1/projects/{project}"), Some(&json!({ "name": name })), false) {
            Ok(_) => println!("  Renamed to \"{name}\""),
            Err(e) => println!("  Could not rename it (continuing anyway): {e}"),
        }
    }
    Ok(project.to_string())
}

fn find_or_create(api: &Api, o: &Options) -> Result<String> {
    step("Finding your Supabase organization");
    let orgs = api.get("/v1/organizations")?;
    let orgs = orgs.as_array().cloned().unwrap_or_default();
    let org = pick_org(&orgs, o.org.as_deref())?;
    let slug = str_of(&org, "slug").to_string();
    println!("  {} ({slug})", str_of(&org, "name"));

    step("Looking for an existing project");
    let projects = api.get("/v1/projects")?;
    let existing = projects.as_array().into_iter().flatten().find(|p| {
        str_of(p, "name") == o.name
            && (str_of(p, "organization_slug") == slug || str_of(p, "organization_id") == str_of(&org, "id"))
    });
    match existing {
        Some(p) => {
            let r = str_of(p, "ref").to_string();
            println!("  Using existing project \"{}\" ({r})", o.name);
            Ok(r)
        }
        None => create_project(api, o, &slug),
    }
}

fn pick_org(orgs: &[Value], wanted: Option<&str>) -> Result<Value> {
    let list = || {
        orgs.iter()
            .map(|o| format!("  {}  ({})", str_of(o, "slug"), str_of(o, "name")))
            .collect::<Vec<_>>()
            .join("\n")
    };
    match wanted {
        Some(w) => orgs
            .iter()
            .find(|o| str_of(o, "slug") == w || str_of(o, "name") == w)
            .cloned()
            .ok_or_else(|| format!("No organization \"{w}\". Yours are:\n{}", list())),
        None => match orgs {
            [] => Err("Your Supabase account has no organizations. Create one in the dashboard first.".into()),
            [one] => Ok(one.clone()),
            _ => Err(format!("You belong to several organizations. Re-run with --org SLUG:\n{}", list())),
        },
    }
}

fn create_project(api: &Api, o: &Options, slug: &str) -> Result<String> {
    let info = api.get(&format!("/v1/organizations/{slug}"))?;
    let plan = str_of(&info, "plan");
    if plan != "free" && !o.allow_paid {
        return Err(format!(
            "This organization is on the \"{plan}\" plan, so a new project adds a monthly compute charge. \
             Re-run with --allow-paid to accept that."
        ));
    }

    step(&format!("Creating project \"{}\" in {}", o.name, o.region));
    let password = random_password(32)?;
    let created = api.call(
        Method::POST,
        "/v1/projects",
        Some(&json!({
            "name": o.name,
            "organization_slug": slug,
            "db_pass": password,
            "region_selection": { "type": "specific", "code": o.region },
        })),
        false,
    )?;
    let project = str_of(&created, "ref").to_string();
    if project.is_empty() {
        return Err("Supabase did not return a project ref".into());
    }

    // Keep the database password outside the repo.
    let dir = home()?.join(".supabase");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let pw_path = dir.join(format!("{project}.db-password"));
    fs::write(&pw_path, &password).map_err(|e| format!("Could not save the database password: {e}"))?;
    println!("  Created {project}");
    println!("  Database password saved to {}", pw_path.display());
    Ok(project)
}

fn wait_until_healthy(api: &Api, project: &str) -> Result<()> {
    step("Waiting for the project to start (usually 1 to 3 minutes)");
    let start = Instant::now();
    let mut last = String::new();
    loop {
        let p = api.get(&format!("/v1/projects/{project}"))?;
        let status = str_of(&p, "status").to_string();
        if status != last {
            println!("  {status}");
            last = status.clone();
        }
        match status.as_str() {
            "ACTIVE_HEALTHY" => break,
            "INIT_FAILED" | "REMOVED" | "RESTORE_FAILED" | "PAUSE_FAILED" => {
                return Err(format!("The project is in state {status}. Check the Supabase dashboard."))
            }
            "INACTIVE" | "PAUSING" => {
                return Err("The project is paused. Restore it in the Supabase dashboard, then run this again.".into())
            }
            _ => {}
        }
        if start.elapsed() > Duration::from_secs(15 * 60) {
            return Err("The project took more than 15 minutes to start. Run this again later.".into());
        }
        sleep(Duration::from_secs(10));
    }

    // Storage must be up before the schema creates the screenshots bucket.
    let services = "db,auth,rest,realtime,storage";
    loop {
        let h = api.get(&format!("/v1/projects/{project}/health?services={services}"))?;
        let waiting: Vec<String> = h
            .as_array()
            .into_iter()
            .flatten()
            .filter(|s| s.get("healthy").and_then(Value::as_bool) != Some(true))
            .map(|s| str_of(s, "name").to_string())
            .collect();
        if waiting.is_empty() {
            println!("  All services healthy");
            return Ok(());
        }
        if start.elapsed() > Duration::from_secs(20 * 60) {
            return Err(format!("These services never became healthy: {}", waiting.join(", ")));
        }
        println!("  Waiting on: {}", waiting.join(", "));
        sleep(Duration::from_secs(10));
    }
}

/// The key the web page uses. Prefers the new publishable key and falls back
/// to the legacy anon key. Never returns a secret or service-role key.
fn public_key(api: &Api, project: &str) -> Result<String> {
    let keys = api.call(Method::GET, &format!("/v1/projects/{project}/api-keys"), None, true)?;
    let keys = keys.as_array().cloned().unwrap_or_default();
    let publishable = keys
        .iter()
        .filter(|k| str_of(k, "type") == "publishable")
        .map(|k| str_of(k, "api_key"))
        .find(|k| k.starts_with("sb_publishable_"));
    let anon = keys
        .iter()
        .filter(|k| str_of(k, "type") == "legacy" && str_of(k, "name") == "anon")
        .map(|k| str_of(k, "api_key"))
        .find(|k| k.starts_with("eyJ"));
    match publishable.or(anon) {
        Some(k) => {
            println!("  Using the {} key", if k.starts_with("sb_publishable_") { "publishable" } else { "legacy anon" });
            Ok(k.to_string())
        }
        None => Err("Could not find a publishable or anon key for this project.".into()),
    }
}

fn github_secret(name: &str, value: &str) -> Result<()> {
    let mut child = Command::new("gh")
        .args(["secret", "set", name, "--repo", GITHUB_REPO])
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Could not run the GitHub CLI (gh): {e}"))?;
    child
        .stdin
        .take()
        .ok_or("gh stdin unavailable")?
        .write_all(value.as_bytes())
        .map_err(|e| e.to_string())?;
    let out = child.wait_with_output().map_err(|e| e.to_string())?;
    if !out.status.success() {
        return Err(format!("gh secret set {name} failed: {}", String::from_utf8_lossy(&out.stderr).trim()));
    }
    Ok(())
}

fn random_password(len: usize) -> Result<String> {
    const ALPHABET: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let mut out = String::with_capacity(len);
    let mut buf = [0u8; 64];
    while out.len() < len {
        getrandom::fill(&mut buf).map_err(|e| format!("No secure random source: {e}"))?;
        for &b in &buf {
            // Rejection sampling keeps every character equally likely.
            if (b as usize) < 248 && out.len() < len {
                out.push(ALPHABET[b as usize % ALPHABET.len()] as char);
            }
        }
    }
    Ok(out)
}

// ---------------------------------------------------------------------------
// sql and status
// ---------------------------------------------------------------------------

/// Project ref from VITE_SUPABASE_URL in .env.local (https://<ref>.supabase.co).
fn project_from_env() -> Result<String> {
    let path = repo_root().join(".env.local");
    let text = fs::read_to_string(&path).map_err(|_| "No .env.local yet. Run `cargo run -p provision -- up` first.".to_string())?;
    text.lines()
        .find_map(|l| l.strip_prefix("VITE_SUPABASE_URL="))
        .and_then(|u| u.trim().strip_prefix("https://"))
        .and_then(|h| h.strip_suffix(".supabase.co"))
        .map(str::to_string)
        .ok_or_else(|| "VITE_SUPABASE_URL in .env.local isn't a https://<ref>.supabase.co address".into())
}

fn sql_command(args: &[String]) -> Result<()> {
    let sql = match args {
        [flag, stmt] if flag == "-c" => stmt.clone(),
        [file] => read(Path::new(file))?,
        _ => return Err(USAGE.into()),
    };
    let api = Api::new()?;
    let project = project_from_env()?;
    let out = api.query(&project, &sql)?;
    println!("{}", serde_json::to_string_pretty(&out).unwrap_or_default());
    Ok(())
}

fn status() -> Result<()> {
    let api = Api::new()?;
    let project = project_from_env()?;
    let p = api.get(&format!("/v1/projects/{project}"))?;
    println!("Project {} ({project}): {}", str_of(&p, "name"), str_of(&p, "status"));
    let h = api.get(&format!("/v1/projects/{project}/health?services=db,auth,rest,realtime,storage"))?;
    for s in h.as_array().into_iter().flatten() {
        let ok = s.get("healthy").and_then(Value::as_bool) == Some(true);
        println!("  {:<9} {}", str_of(s, "name"), if ok { "healthy" } else { "not healthy" });
    }
    let n = api.query(
        &project,
        "select (select count(*) from public.items)::int as items, \
                (select count(*) from public.admins)::int as admins, \
                (select string_agg(domain, ', ') from public.allowed_domains) as domains",
    )?;
    println!(
        "  items: {}  admins: {}  allowed domains: {}",
        n.pointer("/0/items").unwrap_or(&Value::Null),
        n.pointer("/0/admins").unwrap_or(&Value::Null),
        n.pointer("/0/domains").and_then(Value::as_str).unwrap_or("")
    );
    Ok(())
}

fn list() -> Result<()> {
    let api = Api::new()?;
    let orgs = api.get("/v1/organizations")?;
    println!("Organizations:");
    for o in orgs.as_array().into_iter().flatten() {
        let slug = str_of(o, "slug");
        let plan = api
            .get(&format!("/v1/organizations/{slug}"))
            .map(|i| str_of(&i, "plan").to_string())
            .unwrap_or_else(|_| "?".into());
        println!("  {}  (slug {slug}, plan {plan})", str_of(o, "name"));
    }
    let projects = api.get("/v1/projects")?;
    println!("Projects:");
    let mut any = false;
    for p in projects.as_array().into_iter().flatten() {
        any = true;
        println!(
            "  {}  (ref {}, org {}, {}, {})",
            str_of(p, "name"),
            str_of(p, "ref"),
            str_of(p, "organization_slug"),
            str_of(p, "region"),
            str_of(p, "status")
        );
    }
    if !any {
        println!("  (none)");
    }
    Ok(())
}

fn read(path: &Path) -> Result<String> {
    fs::read_to_string(path).map_err(|e| format!("Could not read {}: {e}", path.display()))
}

fn step(msg: &str) {
    println!("\n> {msg}");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn passwords_are_alphanumeric_and_long() {
        let p = random_password(32).unwrap();
        assert_eq!(p.len(), 32);
        assert!(p.chars().all(|c| c.is_ascii_alphanumeric()));
        assert_ne!(p, random_password(32).unwrap());
    }

    #[test]
    fn org_picking() {
        let one = vec![json!({"slug": "a", "name": "A"})];
        assert_eq!(str_of(&pick_org(&one, None).unwrap(), "slug"), "a");
        let two = vec![json!({"slug": "a", "name": "A"}), json!({"slug": "b", "name": "B"})];
        assert!(pick_org(&two, None).is_err());
        assert_eq!(str_of(&pick_org(&two, Some("b")).unwrap(), "slug"), "b");
        assert!(pick_org(&two, Some("c")).is_err());
    }

    #[test]
    fn site_url_gets_trailing_slash() {
        let o = Options::parse(&["--site-url".into(), "https://x.github.io/Board".into()]).unwrap();
        assert_eq!(o.site_url, "https://x.github.io/Board/");
    }
}
