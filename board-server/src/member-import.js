// Parse a pasted NCGA / Nimble AMS member export (tab-separated, with a header
// row) into clean membership records. Tolerant of quoted fields that contain
// tabs or newlines, empty cells, and out-of-state addresses.

// Generic TSV parser. Double-quoted fields may contain tabs and newlines; a
// doubled "" inside a quoted field is a literal quote.
export function parseTsv(text) {
  const s = String(text).replace(/\r\n?/g, '\n');
  const rows = [];
  let row = [], field = '', inQ = false, started = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQ) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; } else inQ = false;
      } else field += c;
    } else if (c === '"' && field === '') {
      inQ = true; started = true;
    } else if (c === '\t') {
      row.push(field); field = ''; started = true;
    } else if (c === '\n') {
      row.push(field); rows.push(row); row = []; field = ''; started = false;
    } else {
      field += c; started = true;
    }
  }
  if (started || field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

// Map the NCGA export to membership records. Columns are found by header name,
// so extra/missing columns and reordering are tolerated.
export function parseNcgaMembers(text) {
  const rows = parseTsv(text);
  if (rows.length < 2) return [];
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const find = (needle) => header.findIndex((h) => h.includes(needle));
  const iName = find('account name');
  const iEmail = find('email');
  const iPhone = header.findIndex((h) => h === 'phone' || h.includes('phone'));
  const iStatus = find('status'); // the status-flag image cell
  const iThru = find('member thru');
  const iDistrict = header.findIndex((h) => h === 'district');
  const iCity = find('billing city');
  const iState = find('billing state');
  const iType = find('member type');

  const get = (cells, idx) => (idx >= 0 && cells[idx] != null ? String(cells[idx]).trim() : '');
  const out = [];
  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r];
    const name = get(cells, iName);
    if (!name) continue;
    const img = get(cells, iStatus);
    let status = 'Active';
    if (/grace/i.test(img)) status = 'Lapsed';
    else if (/expired|lapsed/i.test(img)) status = 'Expired';
    // Current / Future both count as Active.
    const city = get(cells, iCity);
    const state = get(cells, iState);
    const town = city ? (state && state.toUpperCase() !== 'CO' ? `${city}, ${state}` : city) : state;
    const thru = get(cells, iThru);
    const district = get(cells, iDistrict);
    const type = get(cells, iType);
    const notes = [
      thru ? `Member thru ${thru}` : '',
      district ? `District ${district}` : '',
      type && type.toLowerCase() !== 'regular/grower' ? type : '',
    ].filter(Boolean).join(' · ');
    out.push({
      name,
      email: get(cells, iEmail) || null,
      phone: get(cells, iPhone) || null,
      town: town || null,
      status,
      stage: 'New',
      notes: notes || null,
    });
  }
  return out;
}
