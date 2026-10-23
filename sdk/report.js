/**
 * SDK helper: report a booking event from your server code.
 * import { reportBooking } from "booking-agent/report";
 */
export async function reportBooking(event, booking) {
  const core = process.env.BOOKING_AGENT_CORE_URL;
  const key = process.env.BOOKING_AGENT_API_KEY;
  if (!core || !key) throw new Error("booking-agent: set BOOKING_AGENT_CORE_URL and BOOKING_AGENT_API_KEY");
  const res = await fetch(core + "/api/agent/ingest", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-Key": key },
    body: JSON.stringify({ event, booking }),
  });
  if (!res.ok) throw new Error(`booking-agent: ingest failed (${res.status})`);
  return res.json();
}
