# Supabase authentication

SPEED CHESS uses **Supabase Auth for identity** and keeps its own database for **chess data**
(ratings, games, puzzles, clubs, tournaments). This document explains the split, the setup steps and
the security model, so nothing here has to be reverse-engineered later.

---

## 1. What Supabase owns, and what it does not

| Concern | Owner |
| --- | --- |
| Passwords, hashing, re-hashing | **Supabase Auth** (never stored by SPEED CHESS) |
| Email verification, password reset, email change | **Supabase Auth** |
| Sessions and refresh-token rotation | **Supabase Auth** (cookie-based session via `@supabase/ssr`) |
| Public profile row (`profiles`) | **Supabase Postgres**, RLS-protected |
| Ratings (Glicko-2 per time control) | SPEED CHESS API / SQLite |
| Games, moves, analysis, puzzles, clubs, tournaments, messaging | SPEED CHESS API / SQLite |

A player is therefore one Supabase user **and** one local `users` row, linked by
`users.supabase_user_id → auth.users.id`. Nothing was migrated: the 40-table chess schema is
untouched, so every existing feature kept working.

---

## 2. Setup (about five minutes)

> The steps marked **you** need dashboard access. Everything else is already in the repo.

### 2.1 Add your two public values

Create `.env.local` in the project root (it is git-ignored — **never commit it**):

```bash
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Both come from **Project Settings → Data API** (URL) and **API Keys** (publishable key). The
publishable key is designed for browsers: every table it can reach is protected by RLS.

The API reads the same two variables automatically, so there is one source of truth. If your host
injects secrets under different names, set `SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY` instead —
those take precedence.

**Never** put a service-role key in any `VITE_` variable. `VITE_` values are compiled into the
public JavaScript bundle.

### 2.2 Run the database script (**you**)

Supabase dashboard → **SQL Editor** → New query → paste the whole of
[`supabase/schema.sql`](../supabase/schema.sql) → **Run**.

It is idempotent (safe to re-run) and creates:

* `public.profiles` — `id`, `username`, `avatar_url`, `country`, `chess_rating`, `created_at`, `updated_at`
* `public.profile_private` — email and anything else that must never be public
* a `handle_new_user()` trigger on `auth.users` that creates both rows on sign-up
* RLS policies and column-level grants

The last statement prints counts so you can see it worked.

### 2.3 Point the email templates at the app (**you**)

The verification and recovery links use `token_hash`, which works on **any** origin — local,
the Arena preview, and production — with no per-environment redirect allow-list. Edit
**Authentication → Email Templates**:

**Confirm signup** — replace the link with:

```html
<a href="{{ .SiteURL }}/verify-email?token_hash={{ .TokenHash }}&type=signup">Confirm your email</a>
```

**Reset password**:

```html
<a href="{{ .SiteURL }}/reset-password?token_hash={{ .TokenHash }}&type=recovery">Reset your password</a>
```

If you would rather use `{{ .ConfirmationURL }}`, set **Authentication → URL Configuration → Site URL**
to the address players actually open, and add every other origin (including the preview URL) to
**Redirect URLs**. The `token_hash` approach avoids that maintenance entirely.

### 2.4 Turn on email confirmation (**you**)

**Authentication → Providers → Email**: enable **Confirm email**. With it off, accounts are usable
immediately and the verification screen is skipped; the server still refuses unverified sessions on
`/auth/supabase/sync`.

### 2.5 Restart

```bash
npm run dev
```

The sign-in screen switches to email + password, and `/register` sends a confirmation email.

---

## 3. How a request is authenticated

```
Browser                     Supabase Auth            Express API                  SQLite
  │                              │                       │                          │
  │ signInWithPassword ─────────►│                       │                          │
  │◄──────── session cookies ────│                       │                          │
  │                              │                       │                          │
  │ POST /api/auth/supabase/sync (cookies sent) ────────►│                          │
  │                              │◄── getClaims(token) ──│  verify signature+expiry │
  │                              │    (JWKS or /user)    │                          │
  │                              │                       │ ensureLocalUser() ──────►│
  │◄──── sc_session cookie + user + ratings ─────────────│                          │
  │                                                      │                          │
  │ GET /api/me/dashboard (sc_session) ─────────────────►│ resolveSession() ───────►│
```

Two important properties:

* **The server never trusts a cookie's mere presence.** `attachUser()` resolves the legacy session
  first, then falls back to verifying the Supabase token with `getClaims()` (and `getUser()` if
  claims cannot be verified). A forged cookie has no valid signature and gets a `401`.
* **Refreshed tokens are written back.** The per-request server client implements `setAll`, so a
  rotated refresh token is re-issued in `Set-Cookie` instead of being silently dropped — the usual
  cause of "randomly logged out" reports.

There is no Next.js `middleware.ts` in this project (it is a Vite SPA). The job middleware would do —
refresh the session, attach the user, gate protected routes — is performed per request in the API by
`attachUser` + `requireAuth`, which is the server-side equivalent and is not bypassable from the
browser. `ProtectedLayout` in the client is a **convenience**, not the security boundary; the API
enforces access independently.

---

## 4. Database and security model

### Tables

| Table | Purpose |
| --- | --- |
| `public.profiles` | Public chess profile: username, avatar, country, headline rating. Readable by anyone; writable only by its owner, and only for display columns. |
| `public.profile_private` | Personal data (contact email). Readable and writable **only** by its owner. |

### Policies

| Policy | Table | Rule |
| --- | --- | --- |
| `profiles are publicly readable` | `profiles` | `select` for `anon, authenticated` — usernames and ratings are public by design (leaderboards, player pages). |
| `players can update their own profile` | `profiles` | `update` where `auth.uid() = id`, with the same check on the new row. |
| `players can read their own private data` | `profile_private` | `select` where `auth.uid() = id`. |
| `players can update their own private data` | `profile_private` | `update` where `auth.uid() = id`. |

### Why there is no INSERT or DELETE policy

Profiles are created **only** by the `SECURITY DEFINER` trigger, so a client cannot insert a row for
someone else, nor create one with a forged rating. Deleting a profile is done by deleting the auth
user (the foreign key cascades).

### Why `chess_rating`, `id` and `created_at` are not updatable

Grants are **column-scoped**:

```sql
grant update (username, avatar_url, country) on public.profiles to authenticated;
```

A player editing their profile cannot award themselves 3000 rating points; ratings are only ever
awarded by the game service from real results. `profile_private` gets
`grant update (contact_email)` only.

### Trigger hardening

`handle_new_user()` is `security definer` **and** `set search_path = ''`, so a user who can create
objects in another schema cannot shadow the tables or functions it calls. Usernames are
case-insensitively unique, sanitised to `[A-Za-z0-9_]`, padded to the 3-character minimum and given a
numeric suffix on collision.

---

## 5. Screens and behaviour

| Screen | Behaviour |
| --- | --- |
| `/register` | Username, email, password, **confirm password**, country, age + terms. Validates locally, then `supabase.auth.signUp` with the username in `user_metadata`. Shows a "check your email" screen; no access until verified. |
| `/login` | `signInWithPassword` → `/api/auth/supabase/sync` → dashboard. Friendly errors for wrong password, unverified address, rate limiting and duplicates. |
| `/verify-email` | Consumes `?token_hash=…`, exchanges it, provisions the local account, then offers the dashboard. Can resend the confirmation email. |
| `/reset-password` | Consumes the recovery `token_hash`, validates the new password, calls `updateUser`. Offers to send a fresh link if the old one expired. |
| Forgot password | "Send reset link" on `/login`. Always reports success, so accounts cannot be enumerated. |
| Logout | `signOutEverywhere()` clears the Supabase session **and** the API session. |

Unconfigured deployments degrade honestly: the API returns `503 { integrationRequired: true }`, the
client falls back to the legacy login, and nothing pretends to work.

---

## 6. Environment variables

| Variable | Where | Required | Notes |
| --- | --- | --- | --- |
| `VITE_SUPABASE_URL` | client + server | yes | `https://<ref>.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | client + server | yes | Publishable/anon key. Public. |
| `SUPABASE_URL` | server | optional | Overrides the `VITE_` value. |
| `SUPABASE_PUBLISHABLE_KEY` | server | optional | Overrides the `VITE_` value. |

The API loads `.env.local` itself (Vite only does that for the browser bundle), so one file configures
both. Real environment variables take precedence over the file.

---

## 7. Local, preview and production

Because links carry a `token_hash` rather than a fixed redirect, the **same** configuration works
everywhere:

* **Local** — `http://localhost:5173`
* **Arena preview** — the proxied preview origin; no extra configuration
* **Production** — your real domain

The only per-environment requirement is that `VITE_SUPABASE_URL` and
`VITE_SUPABASE_PUBLISHABLE_KEY` are present in that environment. If you prefer
`{{ .ConfirmationURL }}` links, you must instead register each origin under **Redirect URLs**.

---

## 8. Verifying an integration

1. `curl -s localhost:4000/api/auth/supabase/status` → `{"configured":true}`
2. `curl -s localhost:4000/api/meta/config` → shows `supabase.configured`
3. In Supabase: **Table Editor → profiles** gains a row per sign-up
4. Run `npm test` — the "Supabase identity bridge" suite covers provisioning, idempotency, linking
   and the guarantee that a Supabase-managed account has no usable local password
5. Manual: register → confirm email → sign in → dashboard shows your username and rating → logout

---

## 9. Removing Supabase

Unset the two variables. The app falls back to the built-in session auth, and existing Supabase-linked
rows keep their chess data (`supabase_user_id` is simply unused). No data migration is required in
either direction.
