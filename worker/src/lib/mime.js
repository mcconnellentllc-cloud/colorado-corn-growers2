// Just enough MIME to get the text out of a forwarded newsletter.
//
// Written by hand rather than pulled from npm to keep the Worker's zero
// runtime dependencies. It handles what actually arrives: multipart/alternative
// with quoted-printable or base64 parts. It is not a general MIME parser and
// does not pretend to be.

/** Split a raw RFC 822 message into { headers, body }. */
export function splitMessage(raw) {
  const text = String(raw ?? '');
  // Headers end at the first blank line. Tolerate bare LF as well as CRLF.
  const match = text.match(/\r?\n\r?\n/);
  if (!match) return { headers: parseHeaders(text), body: '' };
  const idx = match.index;
  return {
    headers: parseHeaders(text.slice(0, idx)),
    body: text.slice(idx + match[0].length),
  };
}

/** Header block -> lowercase-keyed map, with folded lines unfolded. */
export function parseHeaders(block) {
  const out = {};
  const lines = String(block ?? '').split(/\r?\n/);
  let current = null;

  for (const line of lines) {
    if (/^[ \t]/.test(line) && current) {
      // Continuation of the previous header.
      out[current] += ' ' + line.trim();
      continue;
    }
    const m = line.match(/^([!-9;-~]+):\s*(.*)$/);
    if (!m) continue;
    current = m[1].toLowerCase();
    out[current] = out[current] ? out[current] + '\n' + m[2] : m[2];
  }
  return out;
}

export function decodeQuotedPrintable(input) {
  return String(input ?? '')
    // Soft line breaks.
    .replace(/=\r?\n/g, '')
    .replace(/=([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

export function decodeBase64(input) {
  try {
    return atob(String(input ?? '').replace(/\s+/g, ''));
  } catch {
    return '';
  }
}

/** Interpret bytes that came out of QP/base64 as UTF-8 where we can. */
function utf8(binary) {
  try {
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0) & 0xff);
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  } catch {
    return binary;
  }
}

function decodePart(headers, body) {
  const encoding = (headers['content-transfer-encoding'] || '').trim().toLowerCase();
  if (encoding === 'quoted-printable') return utf8(decodeQuotedPrintable(body));
  if (encoding === 'base64') return utf8(decodeBase64(body));
  return body;
}

function boundaryOf(contentType) {
  const m = String(contentType ?? '').match(/boundary="?([^";]+)"?/i);
  return m ? m[1] : null;
}

/**
 * Walk the message and return the best text we can find: the text/plain part if
 * there is one, otherwise HTML stripped down to text.
 */
export function extractText(raw) {
  const { headers, body } = splitMessage(raw);
  const found = { plain: '', html: '' };
  walk(headers, body, found, 0);

  if (found.plain.trim()) return found.plain.trim();
  if (found.html.trim()) return htmlToText(found.html).trim();
  return String(body ?? '').trim();
}

function walk(headers, body, found, depth) {
  if (depth > 8) return; // Malformed or hostile nesting.

  const contentType = headers['content-type'] || 'text/plain';
  const boundary = boundaryOf(contentType);

  if (/^multipart\//i.test(contentType) && boundary) {
    const marker = '--' + boundary;
    for (const chunk of String(body).split(marker)) {
      const trimmed = chunk.replace(/^\r?\n/, '');
      if (!trimmed || /^--/.test(trimmed)) continue;
      const part = splitMessage(trimmed);
      walk(part.headers, part.body, found, depth + 1);
    }
    return;
  }

  const decoded = decodePart(headers, body);
  if (/^text\/plain/i.test(contentType) && !found.plain) found.plain = decoded;
  else if (/^text\/html/i.test(contentType) && !found.html) found.html = decoded;
}

export function htmlToText(html) {
  return String(html ?? '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    // Keep the href when we flatten a link, so URLs survive into the text.
    .replace(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_, href, label) => {
      const text = label.replace(/<[^>]+>/g, '').trim();
      // Parentheses, not angle brackets: the tag-stripping pass below treats
      // <https://...> as a tag and would delete the URL we just preserved.
      return text && !/^https?:/i.test(text) ? `${text} (${href})` : href;
    })
    .replace(/<\/(p|div|tr|h[1-6]|li)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n');
}

/** Read a Cloudflare Email Worker's raw stream into a string. */
export async function streamToString(stream) {
  const chunks = [];
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) { merged.set(c, offset); offset += c.length; }
  return new TextDecoder('utf-8', { fatal: false }).decode(merged);
}
