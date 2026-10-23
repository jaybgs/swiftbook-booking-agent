#!/usr/bin/env node
/**
 * booking-agent init
 * Scaffolds a /agent dashboard route into the user's project and wires it
 * to the Booking Agent core (core app URL + site API key from env or flags).
 */
import { cp, mkdir, writeFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i !== -1 ? args[i + 1] : undefined;
};

const coreUrl = flag("core") || process.env.BOOKING_AGENT_CORE_URL;
const apiKey = flag("key") || process.env.BOOKING_AGENT_API_KEY;

if (!coreUrl || !apiKey) {
  console.error(
    "booking-agent: missing config.\n" +
    "Run: booking-agent init --core https://<agent-app>.base44.app --key <your-site-api-key>\n" +
    "or set BOOKING_AGENT_CORE_URL and BOOKING_AGENT_API_KEY in your environment."
  );
  process.exit(1);
}

// Detect framework (Next.js App Router supported first; adapters to follow)
const cwd = process.cwd();
const isNextApp = existsSync(path.join(cwd, "app")) || existsSync(path.join(cwd, "src/app"));
if (!isNextApp) {
  console.error("booking-agent: no Next.js app/ or src/app directory found. Only Next.js App Router is supported in v0.1.");
  process.exit(1);
}

const appDir = existsSync(path.join(cwd, "app")) ? "app" : "src/app";
const agentDir = path.join(cwd, appDir, "agent");

await mkdir(agentDir, { recursive: true });

// Dashboard route (client page talking to the core via API key held server-side)
const page = `import { BookingAgentDashboard } from "booking-agent/templates/dashboard";
export default function AgentPage() {
  return <BookingAgentDashboard coreUrl={process.env.BOOKING_AGENT_CORE_URL} />;
}
`;
await writeFile(path.join(agentDir, "page.jsx"), page);

// Server-side API proxy: keeps the site API key off the client
const route = `import { NextResponse } from "next/server";
const CORE = process.env.BOOKING_AGENT_CORE_URL;
const KEY = process.env.BOOKING_AGENT_API_KEY;

async function relay(req, path) {
  const res = await fetch(CORE + path, {
    method: req.method,
    headers: { "Content-Type": "application/json", "X-API-Key": KEY },
    body: req.method === "GET" ? undefined : await req.text(),
  });
  return new NextResponse(await res.text(), { status: res.status, headers: { "Content-Type": "application/json" } });
}

export async function GET(req) { return relay(req, "/api/agent/sites"); }
export async function POST(req) { return relay(req, "/api/agent/ingest"); }
`;
await mkdir(path.join(agentDir, "api"), { recursive: true });
await writeFile(path.join(agentDir, "api", "agent", "route.js"), route);

console.log("booking-agent: created " + appDir + "/agent — dashboard at /agent");
console.log("booking-agent: add BOOKING_AGENT_CORE_URL and BOOKING_AGENT_API_KEY to your .env (server-side only)");
