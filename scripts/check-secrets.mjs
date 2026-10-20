// Fails if a Supabase secret key, service-role key, or personal access token
// appears in the given folder (default: dist) or, with --git, in tracked files.
// A plain text search isn't enough: supabase-js itself mentions the
// service-role name, so this decodes key-shaped tokens and checks their role.
//
//   node scripts/check-secrets.mjs          scan dist/
//   node scripts/check-secrets.mjs --git    scan files tracked by git

import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SERVICE_ROLE = ['service', 'role'].join('_');
const SECRET_KEY = /\bsb_secret_[A-Za-z0-9_-]{10,}/;
const ACCESS_TOKEN = /\bsbp_[A-Za-z0-9]{20,}/;
const JWT = /eyJ[A-Za-z0-9_-]{10,}\.(eyJ[A-Za-z0-9_-]{10,})\.[A-Za-z0-9_-]{10,}/g;

function listFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? listFiles(p) : [p];
  });
}

function problems(text) {
  const found = [];
  if (SECRET_KEY.test(text)) found.push('a Supabase secret key (sb_secret_…)');
  if (ACCESS_TOKEN.test(text)) found.push('a Supabase personal access token (sbp_…)');
  for (const m of text.matchAll(JWT)) {
    try {
      const payload = JSON.parse(Buffer.from(m[1], 'base64url').toString('utf8'));
      if (payload.role === SERVICE_ROLE) found.push('a service-role key');
    } catch {
      /* not a JWT after all */
    }
  }
  return found;
}

const useGit = process.argv.includes('--git');
const files = useGit
  ? execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean)
  : listFiles(process.argv[2] ?? 'dist');

let bad = 0;
for (const f of files) {
  let text;
  try {
    text = readFileSync(f, 'utf8');
  } catch {
    continue;
  }
  for (const what of problems(text)) {
    console.error(`${f}: contains ${what}`);
    bad++;
  }
}
if (bad) {
  console.error(`\n${bad} secret(s) found. Remove them before publishing.`);
  process.exit(1);
}
console.log(`No secret keys found in ${files.length} file(s).`);
