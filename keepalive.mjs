#!/usr/bin/env node
/**
 * Supabase Keep-Alive Agent
 * -------------------------
 * Pings each configured Supabase project's PostgREST API so the project
 * registers real database activity and never crosses the 7-day inactivity
 * window that triggers free-tier pausing.
 *
 * Config comes from either:
 *   - the SUPABASE_PROJECTS env var (JSON string), or
 *   - projects.json in this folder (used for local runs)
 *
 * Each project entry needs:
 *   {
 *     "name": "my-app",              // just a label for logs
 *     "url": "https://xxxx.supabase.co",
 *     "apiKey": "eyJ...",            // anon or service_role key
 *     "table": "keepalive"           // any real table PostgREST can read
 *   }
 *
 * The "table" just needs to exist and be selectable by the key you use.
 * A single-row table with RLS allowing SELECT for anon is enough — see
 * README.md for the one-line SQL to create it.
 *
 * After each run, writes status.json to this folder for the dashboard.
 */

import { readFileSync, existsSync, writeFileSync } from "node:fs";

function loadProjects() {
  if (process.env.SUPABASE_PROJECTS) {
    return JSON.parse(process.env.SUPABASE_PROJECTS);
  }
  const localPath = new URL("./projects.json", import.meta.url);
  if (existsSync(localPath)) {
    return JSON.parse(readFileSync(localPath, "utf-8"));
  }
  throw new Error(
    "No project config found. Set SUPABASE_PROJECTS env var or create projects.json."
  );
}

async function pingProject(project) {
  const { name, url, apiKey, table } = project;
  const endpoint = `${url.replace(/\/+$/, "")}/rest/v1/${table}?select=*&limit=1`;
  const pingedAt = new Date().toISOString();
  const started = Date.now();

  try {
    const res = await fetch(endpoint, {
      method: "GET",
      headers: {
        apikey: apiKey,
        Authorization: `Bearer ${apiKey}`,
      },
    });

    const ms = Date.now() - started;

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return {
        name,
        url: url.replace(/\/+$/, ""),
        ok: false,
        status: res.status,
        ms,
        error: body.slice(0, 300),
        pingedAt,
      };
    }

    return { name, url: url.replace(/\/+$/, ""), ok: true, status: res.status, ms, pingedAt };
  } catch (err) {
    return {
      name,
      url: url.replace(/\/+$/, ""),
      ok: false,
      status: null,
      ms: Date.now() - started,
      error: err.message,
      pingedAt,
    };
  }
}

function writeStatus(results) {
  const statusPath = new URL("./status.json", import.meta.url);
  const payload = {
    lastRun: new Date().toISOString(),
    totalProjects: results.length,
    healthy: results.filter((r) => r.ok).length,
    results,
  };
  writeFileSync(statusPath, JSON.stringify(payload, null, 2), "utf-8");
  console.log(`\nStatus written to status.json`);
}

async function main() {
  const projects = loadProjects();

  if (!Array.isArray(projects) || projects.length === 0) {
    console.error("No projects configured.");
    process.exit(1);
  }

  console.log(`Pinging ${projects.length} project(s)...\n`);

  const results = await Promise.all(projects.map(pingProject));

  let failures = 0;
  for (const r of results) {
    if (r.ok) {
      console.log(`✅ ${r.name} — ${r.status} (${r.ms}ms)`);
    } else {
      failures++;
      console.error(
        `❌ ${r.name} — status=${r.status ?? "n/a"} error=${r.error ?? "unknown"} (${r.ms}ms)`
      );
    }
  }

  console.log(
    `\nDone. ${results.length - failures}/${results.length} projects healthy.`
  );

  // Write status.json for the dashboard to consume
  writeStatus(results);

  // Non-zero exit if anything failed, so GitHub Actions / cron can alert you.
  if (failures > 0) process.exit(1);
}

main();
