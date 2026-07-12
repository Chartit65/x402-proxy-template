import type { Env } from "./env";

export type StatEventType = "browser_visit" | "api_402_peek" | "paid_unlock";

export interface StatEvent {
	ts: string;
	type: StatEventType;
	path: string;
}

export interface StatsSnapshot {
	browser_visits: number;
	api_402_peeks: number;
	paid_unlocks: number;
	recent: StatEvent[];
	kv_connected: boolean;
	updated_at: string | null;
}

const STATS_KEY = "stats:v1";
const MAX_RECENT = 20;

const EMPTY_STATS: StatsSnapshot = {
	browser_visits: 0,
	api_402_peeks: 0,
	paid_unlocks: 0,
	recent: [],
	kv_connected: false,
	updated_at: null,
};

interface StoredStats {
	browser_visits: number;
	api_402_peeks: number;
	paid_unlocks: number;
	recent: StatEvent[];
	updated_at: string;
}

export function isWebBrowser(request: Request): boolean {
	const accept = request.headers.get("Accept") || "";
	const userAgent = request.headers.get("User-Agent") || "";
	return accept.includes("text/html") && userAgent.includes("Mozilla");
}

export async function recordStatEvent(
	env: Env,
	type: StatEventType,
	path: string
): Promise<void> {
	if (!env.STATS_KV) {
		return;
	}

	const stored = await readStoredStats(env);
	const now = new Date().toISOString();

	if (type === "browser_visit") {
		stored.browser_visits += 1;
	} else if (type === "api_402_peek") {
		stored.api_402_peeks += 1;
	} else if (type === "paid_unlock") {
		stored.paid_unlocks += 1;
	}

	stored.recent.unshift({ ts: now, type, path });
	stored.recent = stored.recent.slice(0, MAX_RECENT);
	stored.updated_at = now;

	await env.STATS_KV.put(STATS_KEY, JSON.stringify(stored));
}

export async function getStatsSnapshot(env: Env): Promise<StatsSnapshot> {
	if (!env.STATS_KV) {
		return { ...EMPTY_STATS };
	}

	const stored = await readStoredStats(env);
	return {
		browser_visits: stored.browser_visits,
		api_402_peeks: stored.api_402_peeks,
		paid_unlocks: stored.paid_unlocks,
		recent: stored.recent,
		kv_connected: true,
		updated_at: stored.updated_at,
	};
}

async function readStoredStats(env: Env): Promise<StoredStats> {
	const raw = await env.STATS_KV!.get(STATS_KEY);
	if (!raw) {
		return {
			browser_visits: 0,
			api_402_peeks: 0,
			paid_unlocks: 0,
			recent: [],
			updated_at: new Date().toISOString(),
		};
	}

	try {
		return JSON.parse(raw) as StoredStats;
	} catch {
		return {
			browser_visits: 0,
			api_402_peeks: 0,
			paid_unlocks: 0,
			recent: [],
			updated_at: new Date().toISOString(),
		};
	}
}

export function renderStatsHtml(stats: StatsSnapshot): string {
	const setupNote = stats.kv_connected
		? ""
		: `<p class="warn"><strong>Setup needed:</strong> Cloudflare Dashboard →
			Workers → x402-proxy-template → Settings → Bindings → KV →
			add <code>STATS_KV</code> (create namespace <code>x402-stats</code> first).
			Redeploy, then refresh this page.</p>`;

	const rows =
		stats.recent.length === 0
			? `<tr><td colspan="3">No events yet</td></tr>`
			: stats.recent
					.map(
						(event) =>
							`<tr><td>${formatTorontoTime(event.ts)}</td><td>${labelForType(event.type)}</td><td>${event.path}</td></tr>`
					)
					.join("");

	const updatedLabel = formatTorontoTime(stats.updated_at);

	return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>StillGate Traffic Stats</title>
  <meta http-equiv="refresh" content="30" />
  <style>
    body { font-family: system-ui, sans-serif; max-width: 900px; margin: 2rem auto; padding: 0 1rem; }
    h1 { font-size: 1.4rem; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1rem; margin: 1.5rem 0; }
    .card { border: 1px solid #ddd; border-radius: 8px; padding: 1rem; }
    .num { font-size: 2rem; font-weight: 700; }
    .label { color: #555; font-size: 0.9rem; }
    table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
    th, td { border-bottom: 1px solid #eee; text-align: left; padding: 0.5rem; }
    .warn { background: #fff7ed; border: 1px solid #fdba74; padding: 0.75rem; border-radius: 6px; }
    .sub { color: #666; font-size: 0.9rem; }
  </style>
</head>
<body>
  <h1>StillGate Traffic Stats</h1>
  <p class="sub">Auto-refreshes every 30s.</p>
  ${setupNote}
  <div class="grid">
    <div class="card"><div class="num">${stats.browser_visits}</div><div class="label">Browser visits (paywall HTML)</div></div>
    <div class="card"><div class="num">${stats.api_402_peeks}</div><div class="label">Bot/API 402 peeks (JSON)</div></div>
    <div class="card"><div class="num">${stats.paid_unlocks}</div><div class="label">Paid unlocks (payment settled)</div></div>
  </div>
  <h2>Last ${MAX_RECENT} events</h2>
  <table>
    <thead><tr><th>Time (Toronto)</th><th>Type</th><th>Path</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <p class="sub">Updated: ${updatedLabel} · <a href="/__x402/stats.json">JSON (UTC)</a> · <a href="/">Gallery</a></p>
</body>
</html>`;
}

/** Operator-facing stats HTML — America/Toronto (EST/EDT). */
function formatTorontoTime(iso: string | null): string {
	if (!iso) {
		return "never";
	}

	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) {
		return iso;
	}

	const parts = new Intl.DateTimeFormat("en-CA", {
		timeZone: "America/Toronto",
		month: "short",
		day: "numeric",
		year: "numeric",
		hour: "numeric",
		minute: "2-digit",
		second: "2-digit",
		hour12: true,
	}).formatToParts(date);

	const get = (type: Intl.DateTimeFormatPartTypes) =>
		parts.find((part) => part.type === type)?.value ?? "";

	return `${get("month")} ${get("day")}, ${get("year")} · ${get("hour")}:${get("minute")}:${get("second")} ${get("dayPeriod")} Toronto`;
}

function labelForType(type: StatEventType): string {
	if (type === "browser_visit") {
		return "Browser visit";
	}
	if (type === "api_402_peek") {
		return "Bot/API 402 peek";
	}
	return "Paid unlock";
}
