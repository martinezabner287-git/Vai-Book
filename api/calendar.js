// VaiBook — private calendar feed for Google Calendar / Apple Calendar.
// Lives at  api/calendar.js  in the GitHub repo (NOT inside src/).
// Vercel turns it into  https://vai-book.vercel.app/api/calendar?t=<token>
//
// A business adds that link to their calendar once ("From URL"), and every
// booking shows up there by itself. The token is secret; get_calendar_feed
// in Supabase returns nothing for a wrong one.

const SUPABASE_URL = 'https://nvfpdkpzrtpmvmgzvdca.supabase.co';
const SUPABASE_KEY = 'sb_publishable_zpAA2Gdcm_BJhu1D56tsTw_sBpZXiNA';

// Belize is UTC-6 all year (no daylight saving), so local booking times
// convert to UTC by adding 6 hours.
const BELIZE_OFFSET_HOURS = 6;

const pad = (n) => String(n).padStart(2, '0');

function utcStamp(d) {
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

function belizeToUtc(dateStr, timeStr) {
  const [y, m, d] = String(dateStr).split('-').map(Number);
  const [hh, mm] = String(timeStr || '09:00').split(':').map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1, (hh || 0) + BELIZE_OFFSET_HOURS, mm || 0));
}

function esc(text) {
  return String(text == null ? '' : text)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

// iCalendar lines must be folded at 75 bytes.
function fold(line) {
  const bytes = Buffer.from(line, 'utf8');
  if (bytes.length <= 75) return line;
  const parts = [];
  let current = '';
  for (const ch of line) {
    if (Buffer.byteLength(current + ch, 'utf8') > (parts.length ? 74 : 75)) {
      parts.push(current);
      current = ch;
    } else {
      current += ch;
    }
  }
  if (current) parts.push(current);
  return parts.join('\r\n ');
}

const STATUS_LABEL = {
  pending: 'Pending - needs your OK',
  awaiting_payment: 'Waiting for deposit',
  confirmed: 'Confirmed',
  completed: 'Done',
  done: 'Done',
};

function buildIcs(feed) {
  const business = feed.business || 'VaiBook';
  const now = utcStamp(new Date());
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//VaiBook//Bookings//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${esc(`VaiBook - ${business}`)}`,
    'X-WR-TIMEZONE:America/Belize',
    'REFRESH-INTERVAL;VALUE=DURATION:PT15M',
    'X-PUBLISHED-TTL:PT15M',
  ];

  for (const b of feed.bookings || []) {
    if (!b.date) continue;
    const start = belizeToUtc(b.date, b.time);
    const minutes = Number(b.duration) > 0 ? Number(b.duration) : 30;
    const end = new Date(start.getTime() + minutes * 60000);
    const isPending = b.status === 'pending' || b.status === 'awaiting_payment';
    const who = b.customer || 'Client';
    const summary = `${isPending ? '⏳ ' : ''}${b.service || 'Booking'} - ${who}`;
    const details = [
      `Status: ${STATUS_LABEL[b.status] || b.status || ''}`,
      `Client: ${who}${b.phone ? ` (${b.phone})` : ''}`,
      b.staff ? `With: ${b.staff}` : null,
      b.total != null ? `Total: BZ$${Number(b.total).toFixed(2)}` : null,
      b.order ? `Order: ${b.order}` : null,
      b.notes ? `Note: ${b.notes}` : null,
      'Manage it in VaiBook: https://vai-book.vercel.app/#provider',
    ].filter(Boolean).join('\n');
    const updated = b.updated ? new Date(b.updated) : null;

    lines.push(
      'BEGIN:VEVENT',
      `UID:${b.id}@vaibook`,
      `DTSTAMP:${now}`,
      updated && !isNaN(updated) ? `LAST-MODIFIED:${utcStamp(updated)}` : null,
      `DTSTART:${utcStamp(start)}`,
      `DTEND:${utcStamp(end)}`,
      `SUMMARY:${esc(summary)}`,
      `DESCRIPTION:${esc(details)}`,
      `STATUS:${isPending ? 'TENTATIVE' : 'CONFIRMED'}`,
      'END:VEVENT'
    );
  }

  lines.push('END:VCALENDAR');
  return lines.filter(Boolean).map(fold).join('\r\n') + '\r\n';
}

module.exports = async (req, res) => {
  const raw = (req.query && req.query.t) || '';
  const token = String(Array.isArray(raw) ? raw[0] : raw).replace(/\.ics$/i, '').replace(/[^a-f0-9]/gi, '');

  if (token.length < 32) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.end('Calendar not found');
  }

  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_calendar_feed`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_token: token }),
    });
    const feed = r.ok ? await r.json() : null;
    if (!feed) {
      res.statusCode = r.ok ? 404 : 502;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      return res.end(r.ok ? 'Calendar not found' : 'Calendar temporarily unavailable');
    }
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', 'inline; filename="vaibook.ics"');
    res.setHeader('Cache-Control', 'public, max-age=300');
    return res.end(buildIcs(feed));
  } catch (err) {
    res.statusCode = 502;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.end('Calendar temporarily unavailable');
  }
};

module.exports.buildIcs = buildIcs;
