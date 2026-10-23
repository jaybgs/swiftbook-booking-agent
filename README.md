# SwiftBook Booking Agent

A multi-site booking agent: a central core (SwiftBook, a Base44 app) that manages
sites, rate cards, availability, client communication and owner notifications,
plus this SDK/MCP package that any AI agent or website can install.

## Architecture

- **Core (SwiftBook, Base44 app)**: site registry with per-site API keys,
  notification log with exponential-backoff dispatch, rate cards, FAQ,
  reschedule/refund/balance logic, daily summaries, and agent discovery at
  `/.well-known/agent.json`.
- **Site apps** (e.g. a photography studio): chat booking flow, staff dashboard
  with calendar, chat history, pending-email-approval queue.
- **This package**: CLI that scaffolds an `/agent` dashboard route into any
  Next.js App Router project, an MCP server exposing the core, an SDK helper for
  reporting events, and per-site configs, templates and deterministic rules.

## MCP tools (`mcp/server.js`)

Site management: `agent_init`, `agent_status`, `agent_list_sites`, `agent_pause_site`, `agent_save_site`
Professions: `agent_list_professions`, `agent_get_flow`
Bookings: `agent_get_bookings`, `agent_report_booking`, `agent_reschedule`,
`agent_request_refund`, `agent_check_availability`, `agent_block_dates`
Rate card: `agent_get_ratecard`, `agent_save_ratecard`
Concierge: `agent_get_faq`, `agent_set_faq`, `agent_booking_playbook`
Money + reporting: `agent_collect_balance`, `agent_daily_summary`, `agent_notifications`

Discovery: the core serves `/.well-known/agent.json` describing all endpoints.

## Setup

1. Register a site in the core dashboard and issue a site API key.
2. Scaffold the dashboard route into your project:
   `booking-agent init --core <core-url> --key <site-key>`
3. Run the MCP server:
   `BOOKING_AGENT_CORE_URL=<core-url> BOOKING_AGENT_API_KEY=<site-key> npm run mcp`
4. Report events from your server code:
   `import { reportBooking } from "booking-agent/report";`

## Structure

- `agent.config.json` — global config (owner account, defaults, feature flags)
- `sites/<site>/config.json` — per-site settings: name, API key ref, channels,
  notification triggers, booking rules, reminder policy
- `channels/` — channel definitions and delivery adapters
- `templates/` — notification message templates
- `rules/` — deterministic rules (availability checks, double-booking
  prevention, escalation policy). No pricing or booking decisions are
  AI-generated; AI is limited to summaries and wording.
- `profiles/` — profession profiles (photographer, videographer, real-estate,
  event-planner, generic): terminology, flow notes, FAQ seeds and defaults
  that adapt the base flow to each business type
- `flows/booking-flow.json` — the client conversation playbook (state machine)
- `cli/init.js` — dashboard scaffolding CLI
- `sdk/report.js` — event reporting helper
- `mcp/server.js` — MCP server

## Email policy

Transactional emails send automatically: confirmation (on inquiry),
invoice (on deposit-confirmed), receipt (on balance paid), reschedule
confirmation. Every other outgoing client email queues as a draft awaiting
owner approval (approve / edit / discard from the dashboard or chat).
Refunds are never issued automatically; every refund needs owner approval.

## Professions

The core is profession-neutral: bookings, rate cards, availability and
balances work for any appointment business. `profiles/<id>.json` overlays a
profession on that base: what you call the booking (session, shoot, viewing,
event, appointment), which questions the flow asks, seed FAQ items, and
whether deposits/retainers apply. Register a site with its profession
(`agent_save_site`), then serve the adapted playbook with `agent_get_flow`.
Real estate viewings, for example, skip deposits entirely; event planners
use a retainer. Adding a new profession is one new JSON profile, no code.

## Balance reminders

Automated daily: 14 and 3 days before the event, plus overdue. Maximum one
reminder per booking per day.

## Channels

- Email — via the Gmail integration (compose + send via Gmail API)
- WhatsApp — via the owner's agent channel; receipts, invoices and booking
  info go to client numbers through the owner's number
- Slack — incoming webhook
- iMessage / Instagram DM — no public API; not available for automated sending

## Honesty rules (enforced across the stack)

- An inquiry never holds a date; only a paid deposit does.
- The rate card is always live data from the core, never hardcoded.
- Failed payments are reported as failed, never as confirmed.
- Every send is logged with its true status (sent/failed/skipped).
- Unknown inputs get a polite re-prompt, never a guess.
