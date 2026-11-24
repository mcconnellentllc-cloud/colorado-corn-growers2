// Optional push of public form submissions into an Airtable base, so the board
// can work them in Airtable. A no-op unless AIRTABLE_TOKEN and AIRTABLE_BASE_ID
// are set (configure them on Render). It NEVER throws — an Airtable hiccup must
// not break a member's form submission.
const TOKEN = process.env.AIRTABLE_TOKEN || '';
const BASE = process.env.AIRTABLE_BASE_ID || '';

export const airtableEnabled = () => !!(TOKEN && BASE);

// Fire-and-forget. Call without await; it logs its own failures.
export async function pushToAirtable(table, fields) {
  if (!airtableEnabled()) return;
  try {
    const res = await fetch(`https://api.airtable.com/v0/${BASE}/${encodeURIComponent(table)}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ records: [{ fields }], typecast: true }),
    });
    if (!res.ok) console.error('[airtable] push failed', res.status, await res.text().catch(() => ''));
  } catch (e) {
    console.error('[airtable] push error', e && e.message);
  }
}
