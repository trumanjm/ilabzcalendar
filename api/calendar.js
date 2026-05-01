// api/calendar.js — Vercel Serverless Function
// Handles two actions:
//   POST { action: "freebusy", date: "YYYY-MM-DD" }  → returns busy slots
//   POST { action: "create", ...bookingData }          → creates Meet event, returns link

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "https://www.ilabz.io");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const CLIENT_ID     = process.env.GOOGLE_CLIENT_ID;
  const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
  const REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN;
  const PRIMARY_CAL   = "support@ilabz.io";

  // Step 1: Get a fresh access token using the refresh token
  async function getAccessToken() {
    const r = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id:     CLIENT_ID,
        client_secret: CLIENT_SECRET,
        refresh_token: REFRESH_TOKEN,
        grant_type:    "refresh_token"
      })
    });
    const d = await r.json();
    if (!d.access_token) throw new Error("Failed to get access token: " + JSON.stringify(d));
    return d.access_token;
  }

  const { action } = req.body;

  // ── FREEBUSY: return busy 30-min slots for a given date ──
  if (action === "freebusy") {
    const { date } = req.body; // "YYYY-MM-DD"
    if (!date) return res.status(400).json({ error: "Missing date" });

    try {
      const token  = await getAccessToken();
      const tMin   = date + "T00:00:00-06:00";
      const tMax   = date + "T23:59:59-06:00";

      const fbRes  = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token },
        body: JSON.stringify({
          timeMin,  timeMax: tMax,
          timeZone: "America/Denver",
          items: [{ id: PRIMARY_CAL }]
        })
      });
      const fbData = await fbRes.json();
      const periods = (fbData.calendars?.[PRIMARY_CAL]?.busy) || [];

      // Convert busy periods to 30-min slot keys
      const busy = [];
      const p2 = n => String(n).padStart(2, "0");
      const [y, m, d2] = date.split("-").map(Number);

      periods.forEach(period => {
        const start = new Date(period.start);
        const end   = new Date(period.end);
        for (let h = 8; h < 18; h++) {
          for (let min = 0; min < 60; min += 30) {
            const slotStart = new Date(y, m - 1, d2, h, min);
            const slotEnd   = new Date(y, m - 1, d2, h, min + 30);
            if (slotStart < end && slotEnd > start) {
              busy.push(p2(h) + ":" + p2(min));
            }
          }
        }
      });

      return res.status(200).json({ busy });

    } catch (err) {
      console.error("Freebusy error:", err);
      return res.status(500).json({ error: err.message, busy: [] });
    }
  }

  // ── CREATE: make Google Calendar event + Meet link ────────
  if (action === "create") {
    const {
      firstName, lastName, email, phone,
      date, time, repName, repEmail,
      notifyEmails = []
    } = req.body;

    try {
      const token  = await getAccessToken();
      const p2     = n => String(n).padStart(2, "0");
      const [sh, sm] = time.split(":").map(Number);
      const endH   = sh + (sm + 30 >= 60 ? 1 : 0);
      const endM   = (sm + 30) % 60;
      const [y, mo, d2] = date.split("-");

      const startISO = `${date}T${time}:00-06:00`;
      const endISO   = `${date}T${p2(endH)}:${p2(endM)}:00-06:00`;

      // Build attendees (deduplicated)
      const allEmails = [email, repEmail, ...notifyEmails].filter(Boolean);
      const attendees = [...new Set(allEmails)].map(e => ({ email: e }));

      const eventRes = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(PRIMARY_CAL)}/events?conferenceDataVersion=1`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token },
          body: JSON.stringify({
            summary: `iLabz Demo — ${firstName} ${lastName}`,
            description: [
              "Demo booked via iLabz website.",
              `Rep: ${repName || "—"}`,
              phone ? `Phone: ${phone}` : null
            ].filter(Boolean).join("\n"),
            start: { dateTime: startISO, timeZone: "America/Denver" },
            end:   { dateTime: endISO,   timeZone: "America/Denver" },
            attendees,
            conferenceData: {
              createRequest: {
                requestId: `ilabz-${Date.now()}`,
                conferenceSolutionKey: { type: "hangoutsMeet" }
              }
            },
            reminders: {
              useDefault: false,
              overrides: [
                { method: "email", minutes: 1440 },
                { method: "popup", minutes: 30 }
              ]
            }
          })
        }
      );

      const eventData = await eventRes.json();
      const meetLink  = eventData.conferenceData?.entryPoints
        ?.find(e => e.entryPointType === "video")?.uri || null;

      return res.status(200).json({ success: true, meetLink, eventId: eventData.id });

    } catch (err) {
      console.error("Calendar create error:", err);
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(400).json({ error: "Unknown action" });
}
