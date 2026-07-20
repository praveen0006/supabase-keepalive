<div align="center">

# 🛡️ Supabase Keep-Alive

**Never let your free-tier Supabase projects pause again — and auto-restore them if they do.**

[![GitHub Actions](https://img.shields.io/badge/Automated-GitHub%20Actions-2088FF?logo=github-actions&logoColor=white)](https://github.com/features/actions)
[![Node.js](https://img.shields.io/badge/Node.js-20+-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Dashboard](https://img.shields.io/badge/Dashboard-Live-22d3a5?logo=vercel&logoColor=white)](https://praveen0006.github.io/supabase-keepalive/)

A lightweight, zero-dependency agent that pings your Supabase projects **daily** via GitHub Actions — keeping them active and **automatically restoring** them if they ever get paused.

[**View Live Dashboard →**](https://praveen0006.github.io/supabase-keepalive/)

</div>

---

## ✨ Features

- 🤖 **Fully automated** — runs on GitHub Actions every day, no server needed
- 🔁 **Auto-resume** — if a project is paused, automatically restores it via the Supabase Management API
- 👥 **Multi-account support** — each project can carry its own management token for different Supabase accounts
- 📊 **Live dashboard** — beautiful status page showing ping health & latency per project
- 🔒 **Secure** — credentials stored as encrypted GitHub Secrets, never in code
- ⚡ **Zero dependencies** — uses native Node.js `fetch` and `fs`, no `npm install` needed
- 🚨 **Failure alerts** — GitHub emails you automatically if any ping fails
- 📝 **Status history** — `status.json` is committed after every run so the dashboard stays fresh

---

## 🗂️ Project Structure

```
supabase-keepalive/
├── keepalive.mjs              # Core ping agent (with auto-resume logic)
├── status.json                # Auto-updated after each run by CI
├── index.html                 # Live status dashboard (GitHub Pages)
├── projects.example.json      # Template — copy to projects.json for local dev
├── .gitignore                 # Ignores projects.json (keeps secrets out of git)
└── .github/
    └── workflows/
        └── keepalive.yml      # GitHub Actions workflow (daily at 09:00 UTC)
```

---

## 🚀 Setup Guide

### Step 1 — Create the keepalive table in each Supabase project

For **every** Supabase project you want to keep alive, open its **SQL Editor** and run:

```sql
create table if not exists public.keepalive (
  id serial primary key,
  pinged_at timestamptz default now()
);
insert into public.keepalive default values;

alter table public.keepalive enable row level security;
create policy "allow anon read" on public.keepalive
  for select using (true);
```

Then copy the **Project URL** and **anon public key** from **Project Settings → API**.

---

### Step 2 — Fork or clone this repo

```bash
git clone https://github.com/praveen0006/supabase-keepalive.git
cd supabase-keepalive
```

---

### Step 3 — Add your projects as a GitHub Secret

1. Go to your repo → **Settings → Secrets and variables → Actions**
2. Click **New repository secret**
3. Name: `SUPABASE_PROJECTS`
4. Value: a JSON array with all your projects:

**Basic setup** (ping only, no auto-resume):
```json
[
  {"name":"my-app","url":"https://xxxx.supabase.co","apiKey":"eyJ...","table":"keepalive"}
]
```

**With auto-resume** (recommended — see [Step 4](#step-4--enable-auto-resume-optional-but-recommended)):
```json
[
  {"name":"my-app","url":"https://xxxx.supabase.co","apiKey":"eyJ...","table":"keepalive","mgmtToken":"sbp_..."}
]
```

---

### Step 4 — Enable Auto-Resume _(optional but recommended)_

Auto-resume uses the **Supabase Management API** to automatically restore a paused project instead of just reporting a failure.

#### Get your Supabase Personal Access Token

1. Log in to [app.supabase.com](https://app.supabase.com)
2. Go to **Account → Access Tokens**
3. Click **Generate new token**, give it a name (e.g. `keepalive-bot`), copy the `sbp_...` value

#### Add the token to your project config

Add a `mgmtToken` field to each project entry inside your `SUPABASE_PROJECTS` secret:

```json
[
  {
    "name": "my-app",
    "url": "https://xxxx.supabase.co",
    "apiKey": "eyJ...",
    "table": "keepalive",
    "mgmtToken": "sbp_your_token_here"
  }
]
```

> **Tip — Multiple Supabase accounts?**  
> Each project can have a **different** `mgmtToken`. Projects on account A use account A's token; projects on account B use account B's token. No extra secrets or workflow changes needed.

```json
[
  {
    "name": "project-account-a",
    "url": "https://aaaa.supabase.co",
    "apiKey": "eyJ...",
    "table": "keepalive",
    "mgmtToken": "sbp_account_a_token"
  },
  {
    "name": "project-account-b",
    "url": "https://bbbb.supabase.co",
    "apiKey": "eyJ...",
    "table": "keepalive",
    "mgmtToken": "sbp_account_b_token"
  }
]
```

#### How auto-resume works

When a ping fails, the agent:

1. **Checks project status** via `GET /v1/projects/{ref}` (Management API)
2. **Sends a restore request** via `POST /v1/projects/{ref}/restore`
3. **Polls every 10 seconds** (up to 5 minutes) until the project is `ACTIVE_HEALTHY`
4. **Re-pings** the PostgREST endpoint to confirm the project is truly back
5. **Logs** `[auto-resumed ✨]` in the summary and updates `status.json`

If no `mgmtToken` is provided for a project, auto-resume is skipped and the failure is logged normally.

---

### Step 5 — Enable GitHub Pages (dashboard)

1. Go to repo → **Settings → Pages**
2. Source: **Deploy from a branch** → `main` → `/ (root)` → **Save**
3. Update the `STATUS_URL` in `index.html`:
   ```js
   const STATUS_URL = "https://raw.githubusercontent.com/YOUR_USERNAME/supabase-keepalive/main/status.json";
   ```
4. Dashboard goes live at: `https://YOUR_USERNAME.github.io/supabase-keepalive/`

---

### Step 6 — Trigger the first run

Go to **Actions tab → Supabase Keep-Alive → Run workflow → Run workflow**.

Watch for ✅ on all your projects. After it completes, `status.json` is committed and your dashboard updates automatically.

---

## 🖥️ Local Development

```bash
# Copy the example config
cp projects.example.json projects.json

# Edit projects.json with your real project URLs, anon keys, and optionally mgmtToken
# Then run the agent
node keepalive.mjs

# Open index.html in your browser to preview the dashboard
```

`projects.json` is listed in `.gitignore` so your keys are never accidentally committed.

---

## ⏰ Schedule

The workflow runs **every day at 09:00 UTC** (14:30 IST).

This keeps every project active well within Supabase's **7-day inactivity window**.  
You can also trigger it manually anytime from the **Actions tab**.

---

## 🔧 How It Works

```
GitHub Actions (cron: daily 09:00 UTC)
    │
    ▼
node keepalive.mjs
    │
    ├─ Reads SUPABASE_PROJECTS secret (or projects.json locally)
    │
    ├─ For each project (runs sequentially):
    │   ├─ GET /rest/v1/keepalive?select=*&limit=1
    │   │
    │   ├─ If 200 OK → ✅ log and continue
    │   │
    │   └─ If error AND mgmtToken present:
    │       ├─ GET  /v1/projects/{ref}         → check status
    │       ├─ POST /v1/projects/{ref}/restore → trigger restore
    │       ├─ Poll every 10s → wait for ACTIVE_HEALTHY (max 5 min)
    │       └─ Re-ping to confirm → log ✅ [auto-resumed ✨] or ❌
    │
    ├─ Writes status.json with full results
    └─ Exits non-zero if any project still failed
    │
    ▼
Git: commits updated status.json → pushes to main
    │
    ▼
GitHub Pages: index.html reads status.json → shows live dashboard
```

---

## 🚨 Failure Alerts

If any ping fails (and auto-resume couldn't fix it):
- The GitHub Actions job exits with a **non-zero code**
- The job shows as **❌** in the Actions tab
- **GitHub emails you** by default on workflow failure

No extra setup required for basic alerting.

---

## ➕ Adding More Projects

1. Run the **Step 1 SQL** in the new Supabase project's SQL Editor
2. Edit the `SUPABASE_PROJECTS` secret in GitHub — add the new project object to the array (include `mgmtToken` if you want auto-resume)
3. Trigger the workflow manually to confirm ✅

---

## 📄 License

MIT — free to use, fork, and adapt.

---

<div align="center">
Built to keep free-tier Supabase projects alive forever — and bring them back when they fall. ⚡
</div>
