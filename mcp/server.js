/**
 * SwiftBook Booking Agent MCP server.
 * Tools:
 *  - agent_init:             scaffold the /agent dashboard route into the current project
 *  - agent_booking_playbook: the standard client conversation flow (availability -> proceed -> rate card -> package -> deposit)
 *  - agent_get_ratecard:     this site's live rate card
 *  - agent_save_ratecard:    create or update rate card items
 *  - agent_report_booking:   send a booking event to the SwiftBook core
 *  - agent_status:           check this site's registration and linked channels
 *  - agent_list_sites:       list all sites registered to the account owner
 *  - agent_notifications:    recent notification delivery log
 *  - agent_pause_site:       pause or resume a site's agent
 *  - agent_get_bookings:     list bookings for this site with filters
 *  - agent_check_availability: check whether a date is free
 *  - agent_block_dates:      block dates (blackout, travel, personal)
 *  - agent_reschedule:       move a confirmed booking to a new date
 *  - agent_request_refund:   queue a refund request for owner approval (never auto-refunds)
 *  - agent_collect_balance:  log a balance_reminder event so owner channels get pinged
 *  - agent_get_faq:          this site's FAQ items
 *  - agent_set_faq:          create or update an FAQ item
 *  - agent_daily_summary:    a day's activity: inquiries, bookings, revenue, balances
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readFile } from "node:fs/promises";

const server = new McpServer({ name: "swiftbook-agent", version: "0.4.0" });

const coreUrl = () => process.env.BOOKING_AGENT_CORE_URL;
const apiKey = () => process.env.BOOKING_AGENT_API_KEY;

function missingCreds() {
  return { content: [{ type: "text", text: "Missing BOOKING_AGENT_CORE_URL or BOOKING_AGENT_API_KEY environment variables." }] };
}

async function api(path, opts = {}) {
  const res = await fetch(coreUrl() + path, {
    ...opts,
    headers: { "Content-Type": "application/json", "X-API-Key": apiKey(), ...(opts.headers || {}) },
  });
  return `HTTP ${res.status}\n${await res.text()}`;
}

server.tool(
  "agent_init",
  "Scaffold a /agent management dashboard route into the current Next.js App Router project, wired to the SwiftBook agent core.",
  {
    core: z.string().url().describe("Base URL of the SwiftBook app"),
    key: z.string().describe("Site API key issued by the SwiftBook dashboard"),
  },
  async ({ core, key }) => {
    const { spawnSync } = await import("node:child_process");
    const res = spawnSync(process.execPath,
      [new URL("../cli/init.js", import.meta.url).pathname, "init", "--core", core, "--key", key],
      { encoding: "utf8" });
    return { content: [{ type: "text", text: (res.stdout || "") + (res.stderr || "") }] };
  }
);

server.tool(
  "agent_booking_playbook",
  "Return the standard client booking conversation flow the agent runs: availability check -> proceed question -> live rate card -> package selection -> deposit prompt -> confirmation. Includes state machine, message templates and integrator wiring notes. Use this to implement the flow for any site using the agent.",
  {},
  async () => {
    const flow = await readFile(new URL("../flows/booking-flow.json", import.meta.url), "utf8");
    return { content: [{ type: "text", text: flow }] };
  }
);

server.tool(
  "agent_get_ratecard",
  "Get this site's live rate card (packages with prices, inclusions and deposit amounts). Always fetch fresh — never hardcode.",
  {},
  async () => {
    if (!coreUrl() || !apiKey()) return missingCreds();
    return { content: [{ type: "text", text: await api("/api/agent/ratecard") }] };
  }
);

server.tool(
  "agent_save_ratecard",
  "Create or update a rate card item for this site (package name, description, price, currency, deposit). Omit id to create, include id to update.",
  {
    id: z.string().optional().describe("Existing item id for update"),
    name: z.string().min(1),
    description: z.string().optional(),
    price: z.number().positive(),
    currency: z.string().default("NGN"),
    deposit_amount: z.number().positive().optional().describe("Fixed deposit amount; wins over deposit_percent when both given"),
    deposit_percent: z.number().min(0).max(100).optional(),
    sort_order: z.number().int().optional(),
  },
  async (item) => {
    if (!coreUrl() || !apiKey()) return missingCreds();
    const text = await api("/api/agent/ratecard", { method: "POST", body: JSON.stringify(item) });
    return { content: [{ type: "text", text }] };
  }
);

server.tool(
  "agent_report_booking",
  "Report a booking event (booking_confirmed, deposit_paid, new_inquiry) to SwiftBook so it notifies the owner's channels.",
  {
    event: z.enum(["booking_confirmed", "deposit_paid", "new_inquiry"]),
    booking: z.object({
      reference: z.string(),
      client_name: z.string(),
      client_email: z.string().email(),
      date: z.string().describe("Booking date, ISO 8601 preferred"),
      timezone: z.string().optional().describe("IANA timezone of the booking, e.g. Africa/Lagos"),
      location: z.string().optional(),
      session_type: z.string().optional(),
      deposit_amount: z.number().optional(),
      currency: z.string().optional(),
    }),
  },
  async ({ event, booking }) => {
    if (!coreUrl() || !apiKey()) return missingCreds();
    const text = await api("/api/agent/ingest", {
      method: "POST",
      body: JSON.stringify({ event, booking }),
    });
    return { content: [{ type: "text", text }] };
  }
);

server.tool(
  "agent_status",
  "Check this site's agent registration and linked notification channels.",
  {},
  async () => {
    if (!coreUrl() || !apiKey()) return missingCreds();
    return { content: [{ type: "text", text: await api("/api/agent/sites") }] };
  }
);

server.tool(
  "agent_list_sites",
  "List all sites registered to the account owner, with their status.",
  {},
  async () => {
    if (!coreUrl() || !apiKey()) return missingCreds();
    return { content: [{ type: "text", text: await api("/api/agent/sites") }] };
  }
);

server.tool(
  "agent_notifications",
  "Show the recent notification delivery log (per channel, with true sent/failed/skipped results).",
  {
    limit: z.number().min(1).max(50).optional().describe("Max rows, default 10"),
  },
  async ({ limit }) => {
    if (!coreUrl() || !apiKey()) return missingCreds();
    const q = limit ? `?limit=${limit}` : "";
    return { content: [{ type: "text", text: await api(`/api/agent/notifications${q}`) }] };
  }
);

server.tool(
  "agent_pause_site",
  "Pause or resume a site's agent so it stops/starts dispatching notifications.",
  {
    site_id: z.string().describe("Site id from agent_list_sites"),
    status: z.enum(["active", "paused"]),
  },
  async ({ site_id, status }) => {
    if (!coreUrl() || !apiKey()) return missingCreds();
    const text = await api("/api/agent/site-status", {
      method: "POST",
      body: JSON.stringify({ site_id, status }),
    });
    return { content: [{ type: "text", text }] };
  }
);

server.tool(
  "agent_get_bookings",
  "List bookings for this site with optional filters (status, date range).",
  {
    status: z.enum(["pending", "confirmed", "cancelled"]).optional(),
    from: z.string().optional().describe("Inclusive start date, YYYY-MM-DD"),
    to: z.string().optional().describe("Inclusive end date, YYYY-MM-DD"),
  },
  async ({ status, from, to }) => {
    if (!coreUrl() || !apiKey()) return missingCreds();
    const q = new URLSearchParams();
    if (status) q.set("status", status);
    if (from) q.set("from", from);
    if (to) q.set("to", to);
    const qs = q.toString() ? `?${q}` : "";
    return { content: [{ type: "text", text: await api(`/api/agent/bookings${qs}`) }] };
  }
);

server.tool(
  "agent_check_availability",
  "Check whether a date is free on this site (considers confirmed bookings, blocked dates and buffer rules).",
  {
    date: z.string().describe("Date to check, YYYY-MM-DD"),
  },
  async ({ date }) => {
    if (!coreUrl() || !apiKey()) return missingCreds();
    return { content: [{ type: "text", text: await api(`/api/agent/availability?date=${date}`) }] };
  }
);

server.tool(
  "agent_block_dates",
  "Block one or more dates on this site (blackout, travel, personal). Blocked dates fail availability checks.",
  {
    dates: z.array(z.string()).min(1).describe("Dates to block, YYYY-MM-DD"),
    reason: z.string().optional(),
  },
  async ({ dates, reason }) => {
    if (!coreUrl() || !apiKey()) return missingCreds();
    const text = await api("/api/agent/block-dates", {
      method: "POST",
      body: JSON.stringify({ dates, reason }),
    });
    return { content: [{ type: "text", text }] };
  }
);

server.tool(
  "agent_reschedule",
  "Move a confirmed booking to a new date. Validates the new date against confirmed bookings; if taken, returns the nearest free alternatives.",
  {
    reference: z.string().describe("Booking reference, e.g. NK-A1AEDA"),
    new_date: z.string().describe("Requested new date, YYYY-MM-DD"),
  },
  async ({ reference, new_date }) => {
    if (!coreUrl() || !apiKey()) return missingCreds();
    const text = await api("/api/agent/reschedule", {
      method: "POST",
      body: JSON.stringify({ reference, new_date }),
    });
    return { content: [{ type: "text", text }] };
  }
);

server.tool(
  "agent_request_refund",
  "Queue a refund request for owner approval. Cancels the booking and notifies owner channels; money is NEVER refunded automatically.",
  {
    reference: z.string().describe("Booking reference"),
    reason: z.string().optional(),
  },
  async ({ reference, reason }) => {
    if (!coreUrl() || !apiKey()) return missingCreds();
    const text = await api("/api/agent/refund", {
      method: "POST",
      body: JSON.stringify({ reference, reason }),
    });
    return { content: [{ type: "text", text }] };
  }
);

server.tool(
  "agent_collect_balance",
  "Record a balance_reminder event for a confirmed booking with an outstanding balance, so the owner's channels get pinged.",
  {
    reference: z.string().describe("Booking reference"),
  },
  async ({ reference }) => {
    if (!coreUrl() || !apiKey()) return missingCreds();
    const text = await api("/api/agent/collect-balance", {
      method: "POST",
      body: JSON.stringify({ reference }),
    });
    return { content: [{ type: "text", text }] };
  }
);

server.tool(
  "agent_get_faq",
  "Get this site's FAQ items (question, answer, keywords) used by the chat concierge.",
  {},
  async () => {
    if (!coreUrl() || !apiKey()) return missingCreds();
    return { content: [{ type: "text", text: await api("/api/agent/faq") }] };
  }
);

server.tool(
  "agent_set_faq",
  "Create or update an FAQ item for this site. Omit id to create, include id to update.",
  {
    id: z.string().optional().describe("Existing item id for update"),
    question: z.string().min(1),
    answer: z.string().min(1),
    keywords: z.array(z.string()).optional().describe("Keywords used for matching client questions"),
    sort_order: z.number().int().optional(),
  },
  async (item) => {
    if (!coreUrl() || !apiKey()) return missingCreds();
    const text = await api("/api/agent/faq", { method: "POST", body: JSON.stringify(item) });
    return { content: [{ type: "text", text }] };
  }
);

server.tool(
  "agent_daily_summary",
  "Get a day's activity for this site: new inquiries, confirmed bookings, revenue collected, balances due, upcoming jobs.",
  {
    date: z.string().optional().describe("Day to summarize, YYYY-MM-DD; defaults to today"),
  },
  async ({ date }) => {
    if (!coreUrl() || !apiKey()) return missingCreds();
    const q = date ? `?date=${date}` : "";
    return { content: [{ type: "text", text: await api(`/api/agent/daily-summary${q}`) }] };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
