// Calls one INV API endpoint and returns its rows.
// The service returns JSON wrapped in a string ("{\"Data\": [...], \"RowCount\": n}"), so it may need parsing twice.

const TIMEOUT_MS = 2 * 60 * 1000;

async function fetchRows(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`API returned HTTP ${res.status} for ${url}`);

  let body = await res.json();
  if (typeof body === 'string') body = JSON.parse(body);
  if (!body || !Array.isArray(body.Data)) throw new Error(`Unexpected API response from ${url}`);
  return body.Data;
}

module.exports = { fetchRows };
