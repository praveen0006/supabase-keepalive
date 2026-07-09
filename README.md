<div align="center">

# 🛡️ Supabase Keep-Alive

**Never let your free-tier Supabase projects pause again.**

[![GitHub Actions](https://img.shields.io/badge/Automated-GitHub%20Actions-2088FF?logo=github-actions&logoColor=white)](https://github.com/features/actions)
[![Node.js](https://img.shields.io/badge/Node.js-20+-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Dashboard](https://img.shields.io/badge/Dashboard-Live-22d3a5?logo=vercel&logoColor=white)](https://praveen0006.github.io/supabase-keepalive/)

A lightweight, zero-dependency agent that pings your Supabase projects **3× per week** via GitHub Actions — keeping them active and preventing the 7-day inactivity pause on free tier.

[**View Live Dashboard →**](https://praveen0006.github.io/supabase-keepalive/)

</div>

---

## ✨ Features

- 🤖 **Fully automated** — runs on GitHub Actions every Mon/Wed/Fri, no server needed
- 📊 **Live dashboard** — beautiful status page showing ping health & latency per project
- 🔒 **Secure** — credentials stored as encrypted GitHub Secrets, never in code
- ⚡ **Zero dependencies** — uses native Node.js `fetch` and `fs`, no `npm install` needed
- 🚨 **Failure alerts** — GitHub emails you automatically if any ping fails
- 📝 **Status history** — `status.json` is committed after every run so the dashboard stays fresh

---

## 🗂️ Project Structure

```
supabase-keepalive/
├── keepalive.mjs              # Core ping agent (writes status.json)
├── status.json                # Auto-updated after each run by CI
├── index.html                 # Live status dashboard (GitHub Pages)
├── projects.example.json      # Template — copy to projects.json for local dev
├── .gitignore                 # Ignores projects.json (keeps secrets out of git)
└── .github/
    └── workflows/
        └── keepalive.yml      # GitHub Actions workflow (Mon/Wed/Fri)
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
4. Value: a JSON array (all on one line) with all your projects:

```json
[{"name":"voice-forms","url":"https://xxxx.supabase.co","apiKey":"eyJ...","table":"keepalive"},{"name":"farmy","url":"https://yyyy.supabase.co","apiKey":"eyJ...","table":"keepalive"},{"name":"health-bot","url":"https://zzzz.supabase.co","apiKey":"eyJ...","table":"keepalive"}]
```

---

### Step 4 — Enable GitHub Pages (dashboard)

1. Go to repo → **Settings → Pages**
2. Source: **Deploy from a branch** → `main` → `/ (root)` → **Save**
3. Update the `STATUS_URL` in `index.html`:
   ```js
   const STATUS_URL = "https://raw.githubusercontent.com/praveen0006/supabase-keepalive/main/status.json";
   ```
4. Dashboard goes live at: `https://praveen0006.github.io/supabase-keepalive/`

---

### Step 5 — Trigger the first run

Go to **Actions tab → Supabase Keep-Alive → Run workflow → Run workflow**.

Watch for ✅ on all your projects. After it completes, `status.json` is committed and your dashboard updates automatically.

---

## 🖥️ Local Development

```bash
# Copy the example config
cp projects.example.json projects.json

# Edit projects.json with your real project URLs and anon keys
# Then run the agent
node keepalive.mjs

# Open index.html in your browser to preview the dashboard
```

---

## ⏰ Schedule

The workflow runs automatically on:

| Day | Time (UTC) | IST |
|-----|-----------|-----|
| Monday | 09:00 | 14:30 |
| Wednesday | 09:00 | 14:30 |
| Friday | 09:00 | 14:30 |

This keeps every project active well within Supabase's **7-day inactivity window**.
You can also trigger it manually anytime from the **Actions tab**.

---

## 🚨 Failure Alerts

If any ping fails:
- The GitHub Actions job exits with a **non-zero code**
- The job shows as **❌** in the Actions tab
- **GitHub emails you** by default on workflow failure

No extra setup required for basic alerting.

---

## ➕ Adding More Projects

1. Run the **Step 1 SQL** in the new Supabase project's SQL Editor
2. Edit the `SUPABASE_PROJECTS` secret in GitHub — add the new project object to the array
3. Trigger the workflow manually to confirm ✅

---

## 🔧 How It Works

```
GitHub Actions (cron: Mon/Wed/Fri 09:00 UTC)
    │
    ▼
node keepalive.mjs
    │
    ├─ Reads SUPABASE_PROJECTS secret
    ├─ Fetches /rest/v1/keepalive?select=*&limit=1 on each project
    ├─ Logs ✅ / ❌ per project with latency
    ├─ Writes status.json with full results
    └─ Exits non-zero if any ping failed
    │
    ▼
Git: commits updated status.json → pushes to main
    │
    ▼
GitHub Pages: index.html reads status.json → shows live dashboard
```

---

## 📄 License

MIT — free to use, fork, and adapt.

---

<div align="center">
Built to keep free-tier projects alive forever. ⚡
</div>
