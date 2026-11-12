/**
 * Minimal .env loader for the API.
 *
 * Vite reads `.env.local` for the browser bundle, but the Express process is a plain Node app and
 * would not see those values otherwise. Loading the same file here keeps one source of truth: set
 * the Supabase URL and publishable key once, and both the browser and the server pick them up.
 *
 * Precedence: real environment variables win over the file, so a container/platform secret is never
 * silently overridden by a developer's local file.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
// src/lib -> src -> server -> apps -> repo root. (config.ts sits in src/ and needs one fewer hop;
// an earlier version copied that depth here and silently looked in apps/ instead of the repo root.)
const ROOT = path.resolve(here, '../../../..');

const CANDIDATES = ['.env.local', '.env'];

function parse(content: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    if (!key) continue;
    let value = line.slice(eq + 1).trim();
    // Strip matching quotes, which are common in hand-edited env files.
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    // Allow `export KEY=value`, which people copy from shell snippets.
    out[key.replace(/^export\s+/, '')] = value;
  }
  return out;
}

let loaded = false;

/** Loads `.env.local` (then `.env`) into process.env without overwriting existing values. */
export function loadEnvFiles(): void {
  if (loaded) return;
  loaded = true;
  for (const name of CANDIDATES) {
    const file = path.join(ROOT, name);
    if (!fs.existsSync(file)) continue;
    const values = parse(fs.readFileSync(file, 'utf8'));
    for (const [key, value] of Object.entries(values)) {
      if (process.env[key] === undefined || process.env[key] === '') process.env[key] = value;
    }
  }
}

loadEnvFiles();
