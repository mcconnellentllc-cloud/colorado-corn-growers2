// Colorado's elected officials and agriculture agencies — the board's contact
// directory. This is public-record reference data, verified November 2026
// against primary sources (house.gov, senate.gov, colorado.gov, usda.gov; for
// newly-elected members, their official campaign sites) and kept in code so it
// ships with the deploy.
//
// Seats are shown as they stand for the 120th Congress (members sworn in
// Jan 3, 2027). Where a newly-elected member has no official office yet, the
// `current` holder (serving through Jan 3, 2027) is noted so the board can
// still reach the seat during the lame-duck transition, and the member's
// campaign site is given as the interim contact.
//
// A missing contact field renders as "not yet published" rather than a guess —
// never put an unverified phone or address here.

export const CAPITOL_SWITCHBOARD = '(202) 224-3121';

// status: 'returning' (official office exists now), 'new' (elected Nov 2026,
// office opens Jan 2027), 'office' (an institutional office, not a person).
export const OFFICIALS = [
  // ---- U.S. Senate (both returning; offices exist now) ----
  {
    key: 'sen-bennet', group: 'U.S. Senate', sort: 1,
    name: 'Michael Bennet', party: 'D', title: 'U.S. Senator',
    status: 'returning',
    dc_address: '261 Russell Senate Office Building, Washington, DC 20510',
    phone: '(202) 224-5852',
    contact_url: 'https://www.bennet.senate.gov/contact/',
    website: 'https://www.bennet.senate.gov',
    note: 'Member, Senate Committee on Agriculture, Nutrition, and Forestry &mdash; our seat at the farm-bill table.',
  },
  {
    key: 'sen-hickenlooper', group: 'U.S. Senate', sort: 2,
    name: 'John Hickenlooper', party: 'D', title: 'U.S. Senator',
    status: 'returning',
    phone: '(202) 224-5941',
    contact_url: 'https://www.hickenlooper.senate.gov/contact/',
    website: 'https://www.hickenlooper.senate.gov',
    note: 'Re-elected Nov 3, 2026. Confirm the current DC office suite at hickenlooper.senate.gov/office-locations before mailing.',
  },

  // ---- U.S. House (incoming 120th Congress; new members noted) ----
  {
    key: 'co-01', group: 'U.S. House', sort: 11, district: '1st District',
    name: 'Melat Kiros', party: 'D', title: 'U.S. Representative-elect, CO-01',
    status: 'new', office_opens: 'January 2027',
    campaign_url: 'https://www.kirosforco.com',
    current: { name: 'Rep. Diana DeGette (D)', note: 'serving through Jan 3, 2027' },
  },
  {
    key: 'co-02', group: 'U.S. House', sort: 12, district: '2nd District',
    name: 'Joe Neguse', party: 'D', title: 'U.S. Representative, CO-02',
    status: 'returning',
    dc_address: '2400 Rayburn House Office Building, Washington, DC 20515',
    phone: '(202) 225-2161',
    contact_url: 'https://neguse.house.gov/contact',
    website: 'https://neguse.house.gov',
  },
  {
    key: 'co-03', group: 'U.S. House', sort: 13, district: '3rd District',
    name: 'Jeff Hurd', party: 'R', title: 'U.S. Representative, CO-03',
    status: 'returning',
    dc_address: '1641 Longworth House Office Building, Washington, DC 20515',
    phone: '(202) 225-4676',
    contact_url: 'https://hurd.house.gov/contact',
    website: 'https://hurd.house.gov',
    note: 'The 3rd carries much of the Western Slope and the San Luis Valley.',
  },
  {
    key: 'co-04', group: 'U.S. House', sort: 14, district: '4th District',
    name: 'Eileen Laubacher', party: 'D', title: 'U.S. Representative-elect, CO-04',
    status: 'new', office_opens: 'January 2027',
    campaign_url: 'https://eileenforcolorado.com',
    current: { name: 'Rep. Lauren Boebert (R)', note: 'serving through Jan 3, 2027' },
    note: 'The 4th carries the eastern plains and most of Colorado&rsquo;s corn ground.',
  },
  {
    key: 'co-05', group: 'U.S. House', sort: 15, district: '5th District',
    name: 'Jessica Killin', party: 'D', title: 'U.S. Representative-elect, CO-05',
    status: 'new', office_opens: 'January 2027',
    campaign_url: 'https://www.killinforcolorado.com/contact',
    campaign_email: 'info@killinforcolorado.com',
    current: { name: 'Rep. Jeff Crank (R)', note: 'serving through Jan 3, 2027' },
  },
  {
    key: 'co-06', group: 'U.S. House', sort: 16, district: '6th District',
    name: 'Jason Crow', party: 'D', title: 'U.S. Representative, CO-06',
    status: 'returning',
    dc_address: '1323 Longworth House Office Building, Washington, DC 20515',
    phone: '(202) 225-7882',
    contact_url: 'https://crow.house.gov/contact',
    website: 'https://crow.house.gov',
  },
  {
    key: 'co-07', group: 'U.S. House', sort: 17, district: '7th District',
    name: 'Brittany Pettersen', party: 'D', title: 'U.S. Representative, CO-07',
    status: 'returning',
    dc_address: '348 Cannon House Office Building, Washington, DC 20515',
    phone: '(202) 225-2645',
    contact_url: 'https://pettersen.house.gov/contact/',
    website: 'https://pettersen.house.gov',
  },
  {
    key: 'co-08', group: 'U.S. House', sort: 18, district: '8th District',
    name: 'Manny Rutinel', party: 'D', title: 'U.S. Representative-elect, CO-08',
    status: 'new', office_opens: 'January 2027',
    campaign_url: 'https://mannyforcolorado.com',
    current: { name: 'Rep. Gabe Evans (R)', note: 'serving through Jan 3, 2027' },
    note: 'The 8th runs through Adams and Weld counties &mdash; farm and feedyard country.',
  },

  // ---- State executive ----
  {
    key: 'gov', group: 'Governor &amp; State', sort: 21,
    name: 'Office of the Governor of Colorado', party: '', title: 'Governor&rsquo;s Office',
    status: 'office',
    dc_address: '200 E. Colfax Ave., Room 136, Denver, CO 80203',
    phone: '(303) 866-2471',
    contact_url: 'https://governorsoffice.colorado.gov/governor/contact-us',
    website: 'https://governorsoffice.colorado.gov',
    note: 'Constituent services: (303) 866-2885. Gov.-elect Phil Weiser takes office January 2027, succeeding Gov. Jared Polis.',
  },
  {
    key: 'cda', group: 'Governor &amp; State', sort: 22,
    name: 'Colorado Department of Agriculture', party: '', title: 'State Agriculture Agency',
    status: 'office',
    dc_address: '305 Interlocken Parkway, Broomfield, CO 80021',
    phone: '(303) 869-9000',
    contact_url: 'https://ag.colorado.gov/home/contact-us',
    website: 'https://ag.colorado.gov',
    note: 'Commissioner of Agriculture: Kate Greenberg. Commissioner&rsquo;s office contacts at ag.colorado.gov/commissioners-office-contacts.',
  },

  // ---- Federal ag agencies in Colorado ----
  {
    key: 'fsa-co', group: 'USDA in Colorado', sort: 31,
    name: 'USDA Farm Service Agency — Colorado State Office', party: '', title: 'FSA State Office',
    status: 'office',
    dc_address: 'Denver Federal Center, Building 56, Room 2760, Lakewood, CO 80225',
    phone: '(720) 544-2876',
    website: 'https://www.fsa.usda.gov/state-offices/colorado',
  },
  {
    key: 'nrcs-co', group: 'USDA in Colorado', sort: 32,
    name: 'USDA Natural Resources Conservation Service — Colorado', party: '', title: 'NRCS State Office',
    status: 'office',
    dc_address: 'Denver Federal Center, Building 56, Room 2400, PO Box 25426, Denver, CO 80225-0426',
    phone: '(720) 544-2810',
    website: 'https://www.nrcs.usda.gov/state-offices/colorado',
  },
];

// Groups, in display order.
export const OFFICIAL_GROUPS = ['U.S. Senate', 'U.S. House', 'Governor &amp; State', 'USDA in Colorado'];

// The office options a survey respondent can pick from (every person/office).
export function officeOptions() {
  return OFFICIALS.map((o) => ({ key: o.key, label: `${o.name}${o.district ? ' — ' + o.district : ''}` }));
}

// Find an office by key (for labelling a survey response).
export function officeByKey(key) {
  return OFFICIALS.find((o) => o.key === key) || null;
}
