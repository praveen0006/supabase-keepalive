#!/usr/bin/env node
/**
 * Supabase Keep-Alive Agent
 * -------------------------
 * Pings each configured Supabase project's PostgREST API so the project
 * registers real database activity and never crosses the 7-day inactivity
 * window that triggers free-tier pausing.
 *
 * If a project is paused (non-2xx response), the agent will automatically
 * restore it via the Supabase Management API, wait for it to become healthy,
 * then re-ping to confirm.
 *
 * Supports MULTIPLE Supabase accounts. Each project can carry its own
 * management token via the optional "mgmtToken" field, falling back to the
 * global SUPABASE_ACCESS_TOKEN environment variable.
 *
 * Config comes from either:
 *   - the SUPABASE_PROJECTS env var (JSON string), or
 *   - projects.json in this folder (used for local runs)
 *
 * Each project entry:
 *   {
 *     "name": "my-app",              // label for logs
 *     "url": "https://xxxx.supabase.co",
 *     "apiKey": "eyJ...",            // anon or service_role key
 *     "table": "keepalive",          // any selectable table
 *     "mgmtToken": "sbp_..."         // OPTIONAL — Supabase personal access
 *                                    // token for THIS project's account.
 *                                    // Falls back to SUPABASE_ACCESS_TOKEN.
 *   }
 *
 * The "table" just needs to exist and be selectable by the key you use.
 * A single-row table with RLS allowing SELECT for anon is enough — see
 * README.md for the one-line SQL to create it.
 *
 * After each run, writes status.json to this folder for the dashboard.
 */

import { readFileSync, existsSync, writeFileSync } from "node:fs";

const MGMT_API = "https://api.supabase.com/v1";
const RESUME_POLL_INTERVAL_MS = 10_000; // poll every 10 seconds
const RESUME_TIMEOUT_MS = 5 * 60_000;  // give up after 5 minutes

// ─── Config loading ────────────────────────────────────────────────────────────

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

// ─── Management API helpers ────────────────────────────────────────────────────

/** Extract the project ref (subdomain) from a Supabase URL. */
function extractRef(url) {
  const match = url.match(/https?:\/\/([^.]+)\.supabase\.co/);
  return match ? match[1] : null;
}

/** Get the current project status from the Management API. */
async function getProjectStatus(ref, token) {
  try {
    const res = await fetch(`${MGMT_API}/projects/${ref}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.status; // e.g. "ACTIVE_HEALTHY", "INACTIVE", "RESTORING"
  } catch {
    return null;
  }
}

/** Send a restore request for a paused project. */
async function requestRestore(ref, token) {
  const res = await fetch(`${MGMT_API}/projects/${ref}/restore`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(`  ✗ Restore API call failed (HTTP ${res.status}): ${body.slice(0, 200)}`);
    return false;
  }
  return true;
}

/** Poll until the project is ACTIVE_HEALTHY or we time out. */
async function waitForHealthy(ref, token, name) {
  const deadline = Date.now() + RESUME_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, RESUME_POLL_INTERVAL_MS));
    const status = await getProjectStatus(ref, token);
    console.log(`  ⟳  [${name}] Management API status: ${status ?? "unknown"}`);
    if (status === "ACTIVE_HEALTHY") return true;
  }
  console.error(`  ✗ [${name}] Timed out waiting for project to become healthy (5 min).`);
  return false;
}

// ─── Ping logic ────────────────────────────────────────────────────────────────

async function pingProject(project, globalToken) {
  const { name, url, apiKey, table } = project;
  // Per-project token takes priority over the global env var token
  const token = project.mgmtToken || globalToken;
  const cleanUrl = url.replace(/\/+$/, "");
  const endpoint = `${cleanUrl}/rest/v1/${table}?select=*&limit=1`;
  const pingedAt = new Date().toISOString();
  const started = Date.now();

  const doFetch = () =>
    fetch(endpoint, {
      method: "GET",
      headers: {
        apikey: apiKey,
        Authorization: `Bearer ${apiKey}`,
      },
    });

  // ── First attempt ────────────────────────────────────────────────────────────
  let res;
  try {
    res = await doFetch();
  } catch (err) {
    return {
      name, url: cleanUrl, ok: false, status: null,
      ms: Date.now() - started, error: err.message, pingedAt, resumed: false,
    };
  }

  if (res.ok) {
    return { name, url: cleanUrl, ok: true, status: res.status, ms: Date.now() - started, pingedAt, resumed: false };
  }

  const firstBody = await res.text().catch(() => "");
  console.log(`  ⚠  [${name}] Ping failed — HTTP ${res.status}. Body: ${firstBody.slice(0, 150)}`);

  // ── Auto-resume if we have a management token ────────────────────────────────
  if (token) {
    const ref = extractRef(url);
    if (ref) {
      // Check if the project is actually paused/inactive via Management API
      const currentStatus = await getProjectStatus(ref, token);
      console.log(`  ℹ  [${name}] Management API reports status: ${currentStatus ?? "unknown"}`);

      if (currentStatus === "INACTIVE" || currentStatus === null || (currentStatus && currentStatus !== "ACTIVE_HEALTHY")) {
        console.log(`  ⏸  [${name}] Requesting project restore...`);
        const triggered = await requestRestore(ref, token);

        if (triggered) {
          console.log(`  ↻  [${name}] Restore request accepted. Polling for ACTIVE_HEALTHY...`);
          const isHealthy = await waitForHealthy(ref, token, name);

          if (isHealthy) {
            console.log(`  🟢 [${name}] Project is back online — re-pinging...`);
            try {
              const res2 = await doFetch();
              const ms2 = Date.now() - started;
              if (res2.ok) {
                return { name, url: cleanUrl, ok: true, status: res2.status, ms: ms2, pingedAt, resumed: true };
              }
              const body2 = await res2.text().catch(() => "");
              return { name, url: cleanUrl, ok: false, status: res2.status, ms: ms2, error: body2.slice(0, 300), pingedAt, resumed: true };
            } catch (err) {
              return { name, url: cleanUrl, ok: false, status: null, ms: Date.now() - started, error: err.message, pingedAt, resumed: true };
            }
          } else {
            return {
              name, url: cleanUrl, ok: false, status: null,
              ms: Date.now() - started,
              error: "Restore triggered but project did not become ACTIVE_HEALTHY within 5 minutes.",
              pingedAt, resumed: true,
            };
          }
        }
      }
    }
  } else {
    console.warn(`  ℹ  SUPABASE_ACCESS_TOKEN not set — skipping auto-resume for ${name}.`);
  }

  return {
    name, url: cleanUrl, ok: false, status: res.status,
    ms: Date.now() - started, error: firstBody.slice(0, 300), pingedAt, resumed: false,
  };
}

// ─── Status output ─────────────────────────────────────────────────────────────

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

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const projects = loadProjects();
  const globalToken = process.env.SUPABASE_ACCESS_TOKEN || null;

  // Count how many projects have a token (per-project or global)
  const withToken = projects.filter((p) => p.mgmtToken || globalToken).length;
  const withPerProject = projects.filter((p) => p.mgmtToken).length;

  if (!globalToken && withPerProject === 0) {
    console.warn("⚠  No management tokens found — auto-resume is disabled.\n");
  } else {
    const lines = [];
    if (globalToken) lines.push("global SUPABASE_ACCESS_TOKEN");
    if (withPerProject > 0) lines.push(`${withPerProject} project-level mgmtToken(s)`);
    console.log(`🔑 Management tokens: ${lines.join(" + ")} — auto-resume enabled for ${withToken}/${projects.length} project(s).\n`);
  }

  if (!Array.isArray(projects) || projects.length === 0) {
    console.error("No projects configured.");
    process.exit(1);
  }

  console.log(`Pinging ${projects.length} project(s)...\n`);

  // Run sequentially — restoring a paused project can take minutes,
  // so parallel execution would race on the polling loop.
  const results = [];
  for (const project of projects) {
    console.log(`→ ${project.name}`);
    const r = await pingProject(project, globalToken);
    results.push(r);
    console.log("");
  }

  let failures = 0;
  console.log("── Summary ─────────────────────────────────────────");
  for (const r of results) {
    const resumedTag = r.resumed ? " [auto-resumed ✨]" : "";
    if (r.ok) {
      console.log(`✅ ${r.name}${resumedTag} — HTTP ${r.status} (${r.ms}ms)`);
    } else {
      failures++;
      console.error(
        `❌ ${r.name}${resumedTag} — status=${r.status ?? "n/a"} | error: ${r.error ?? "unknown"} (${r.ms}ms)`
      );
    }
  }

  console.log(
    `\nDone. ${results.length - failures}/${results.length} projects healthy.`
  );

  writeStatus(results);

  // Non-zero exit so GitHub Actions marks the run as failed when any ping fails.
  if (failures > 0) process.exit(1);
}

main();
