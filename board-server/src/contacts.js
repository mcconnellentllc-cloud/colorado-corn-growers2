// Verified contact lists for the board's mailing / outreach CSVs, served as
// downloads from the Officials tab. Public-record data, verified November 2026
// against primary sources (content.leg.colorado.gov, governorsoffice.colorado.gov,
// ag.colorado.gov, fsa.usda.gov, nrcs.usda.gov). Office/staff level only — no
// fabricated addresses; where a source didn't publish a field it is left blank.
//
// The federal delegation CSV is built separately from officials.js (OFFICIALS).

const qv = (v) => { const x = String(v == null ? '' : v); return /[",\n\r]/.test(x) ? '"' + x.replace(/"/g, '""') + '"' : x; };
export function toCsv(header, rows) {
  return [header.join(','), ...rows.map((r) => r.map(qv).join(','))].join('\r\n');
}
const splitName = (n) => { const p = n.trim().split(/\s+/); return [p.shift() || '', p.join(' ')]; };

/* ---- Colorado General Assembly (currently seated, 2026 session) ---- */
// Name|Chamber|District|Party|Email|Phone  — verified from content.leg.colorado.gov
const LEG_RAW = `Judy Amabile|Senate|18|Democrat|judy.amabile.senate@coleg.gov|303-866-4872
Mark Baisley|Senate|4|Republican|mark.baisley@senate.co.com|303-866-4877
Matt Ball|Senate|31|Democrat|matt.ball.senate@coleg.gov|303-866-4861
Jeff Bridges|Senate|26|Democrat|jeff.bridges.senate@coleg.gov|303-866-4846
Scott Bright|Senate|13|Republican|scott.bright.senate@coleg.gov|303-866-4855
John Carson|Senate|30|Republican|john.carson.senate@coleg.gov|303-866-4881
Marc Catlin|Senate|5|Republican|marc.catlin.senate@coleg.gov|303-866-5292
James Coleman|Senate|33|Democrat|james.coleman.senate@coleg.gov|303-866-4864
Lisa Cutter|Senate|20|Democrat|lisa.cutter.senate@coleg.gov|303-866-4859
Jessie Danielson|Senate|22|Democrat|jessie.danielson.senate@coleg.gov|303-866-4856
Lindsey Daugherty|Senate|19|Democrat|lindsey.daugherty.senate@coleg.gov|303-866-4840
Tony Exum|Senate|11|Democrat|tony.exum.senate@coleg.gov|303-866-6364
Lisa Frizell|Senate|2|Republican|lisa.frizell.senate@coleg.gov|303-866-4869
Julie Gonzales|Senate|34|Democrat|julie.gonzales.senate@coleg.gov|303-866-4862
Nick Hinrichsen|Senate|3|Democrat|nick.hinrichsen.senate@coleg.gov|303-866-4878
Iman Jodeh|Senate|29|Democrat|iman.jodeh.senate@coleg.gov|303-866-3432
Cathy Kipp|Senate|14|Democrat|cathy.kipp.senate@coleg.gov|303-866-4841
Barbara Kirkmeyer|Senate|23|Republican|barbara.kirkmeyer.senate@coleg.gov|303-866-4876
Chris Kolker|Senate|16|Democrat|chris.kolker.senate@coleg.gov|303-866-4883
William Lindstedt|Senate|25|Democrat|william.lindstedt.senate@coleg.gov|303-866-4863
Larry Liston|Senate|10|Republican|larry.liston.senate@coleg.gov|303-866-2737
Janice Marchman|Senate|15|Democrat|janice.marchman.senate@coleg.gov|303-866-4853
Dafna Michaelson Jenet|Senate|21|Democrat|dafna.michaelson.jenet.senate@coleg.gov|303-866-4857
Kyle Mullica|Senate|24|Democrat|kyle.mullica.senate@coleg.gov|303-866-4451
Byron Pelton|Senate|1|Republican|byron.pelton.senate@coleg.gov|303-866-6360
Rod Pelton|Senate|35|Republican|rod.pelton.senate@coleg.gov|303-866-4884
Janice Rich|Senate|7|Republican|janicerichsd7@gmail.com|303-866-3077
Dylan Roberts|Senate|8|Democrat|dylan.roberts.senate@coleg.gov|303-866-4871
Robert Rodriguez|Senate|32|Democrat|robert.rodriguez.senate@coleg.gov|303-866-4852
Cleave Simpson|Senate|6|Republican|cleave.simpson.senate@coleg.gov|303-866-4875
Marc Snyder|Senate|12|Democrat|marc.snyder.senate@coleg.gov|303-866-4880
Tom Sullivan|Senate|27|Democrat|tom.sullivan.senate@coleg.gov|303-866-4873
Katie Wallace|Senate|17|Democrat|katie.wallace.senate@coleg.gov|303-866-5291
Mike Weissman|Senate|28|Democrat|mike.weissman.senate@coleg.gov|303-866-4879
Lynda Zamora Wilson|Senate|9|Republican|lynda.zamorawilson.senate@coleg.gov|303-866-4835
Jennifer Bacon|House|7|Democrat|jennifer.bacon.house@coleg.gov|303-866-2909
Carlos Barron|House|48|Republican|carlos.barron.house@coleg.gov|303-866-2943
Andrew Boesenecker|House|53|Democrat|andrew.boesenecker.house@coleg.gov|303-866-2917
Scott Bottoms|House|15|Republican|scott.bottoms.house@coleg.gov|303-866-5525
Mary Bradfield|House|21|Republican|mary.bradfield.house@coleg.gov|303-866-2946
Brandi Bradley|House|39|Republican|brandi.bradley.house@coleg.gov|303-866-2935
Max Brooks|House|45|Republican|max.brooks.house@coleg.gov|303-866-2948
Kyle Brown|House|12|Democrat|kyle.brown.house@coleg.gov|303-866-2920
Jarvis Caldwell|House|20|Republican|jarvis.caldwell.house@coleg.gov|303-866-2191
Sean Camacho|House|6|Democrat|sean.camacho.house@coleg.gov|303-866-2911
Michael Carter|House|36|Democrat|michael.carter.house@coleg.gov|303-866-2942
Chad Clifford|House|37|Democrat|chad.clifford.house@coleg.gov|303-866-5510
Ken DeGraaf|House|22|Republican|ken.degraaf.house@coleg.gov|303-866-2927
Monica Duran|House|23|Democrat|monica.duran.house@coleg.gov|303-866-5522
Regina English|House|17|Democrat|regina.english.house@coleg.gov|303-866-3069
Cecelia Espenoza|House|4|Democrat|cecelia.espenoza.house@coleg.gov|303-866-2954
Lisa Feret|House|24|Democrat|lisa.feret.house@coleg.gov|303-866-2950
Ava Flanell|House|14|Republican|ava.flanell.house@coleg.gov|303-866-2965
Meg Froelich|House|3|Democrat|meg.froelich.house@coleg.gov|303-866-2921
Lorena Garcia|House|35|Democrat|lorena.garcia.house@coleg.gov|303-866-2964
Lori Garcia Sander|House|65|Republican|lori.garciasander.house@coleg.gov|303-866-2907
Lindsay Gilchrist|House|8|Democrat|lindsay.gilchrist.house@coleg.gov|303-866-2959
Lori Goldstein|House|29|Democrat|lori.goldstein.house@coleg.gov|303-866-2843
Ryan Gonzalez|House|50|Republican|ryan.gonzalez.house@coleg.gov|303-866-2929
Eliza Hamrick|House|61|Democrat|eliza.hamrick.house@coleg.gov|303-866-3706
Anthony Hartsook|House|44|Republican|anthony.hartsook.house@coleg.gov|303-866-2933
Jamie Jackson|House|41|Democrat|jamie.jackson.house@coleg.gov|303-866-2919
Dusty Johnson|House|63|Republican|dustyforcolorado@gmail.com|303-866-2398
Junie Joseph|House|10|Democrat|junie.joseph.house@coleg.gov|303-866-2915
Rebecca Keltie|House|16|Republican|rebecca.keltie.house@coleg.gov|303-866-2937
Sheila Lieder|House|28|Democrat|sheila.lieder.house@coleg.gov|303-866-2939
Mandy Lindsay|House|42|Democrat|mandy.lindsay.house@coleg.gov|303-866-3911
Stephanie Luck|House|60|Republican|stephanie.luck.house@coleg.gov|303-866-2905
Meghan Lukens|House|26|Democrat|meghan.lukens.house@coleg.gov|303-866-2923
Javier Mabrey|House|1|Democrat|javier.mabrey.house@coleg.gov|303-866-2966
Bob Marshall|House|43|Democrat|bob.marshall.house@coleg.gov|303-866-2936
Matthew Martinez|House|62|Democrat|matthew.martinez.house@coleg.gov|303-866-2916
Tisha Mauro|House|46|Democrat|tisha.mauro.house@coleg.gov|303-866-2968
Julie McCluskie|House|13|Democrat|julie.mccluskie.house@coleg.gov|303-866-2952
Karen McCormick|House|11|Democrat|karen.mccormick.house@coleg.gov|303-866-2780
Kenny Nguyen|House|33|Democrat|kenny.nguyen.house@coleg.gov|303-866-4667
Amy Paschal|House|18|Democrat|amy.paschal.house@coleg.gov|303-866-2932
Jacque Phillips|House|31|Democrat|jacque.phillips.house@coleg.gov|303-866-2918
Chris Richardson|House|56|Republican|chris.richardson.house@coleg.gov|303-866-2912
Naquetta Ricks|House|40|Democrat|naquetta.ricks.house@coleg.gov|303-866-2944
Manny Rutinel|House|32|Democrat|manny.rutinel.house@coleg.gov|303-866-2945
Gretchen Rydin|House|38|Democrat|gretchen.rydin.house@coleg.gov|303-866-2953
Emily Sirota|House|9|Democrat|emily.sirota.house@coleg.gov|303-866-2910
Scott Slaugh|House|64|Republican|scott.slaugh.house@coleg.gov|303-866-2906
Lesley Smith|House|49|Democrat|lesley.smith.house@coleg.gov|303-866-2578
Matt Soper|House|54|Republican|matthew.soper.house@coleg.gov|303-866-2583
Katie Stewart|House|59|Democrat|katie.stewart.house@coleg.gov|303-866-2914
Rebekah Stewart|House|30|Democrat|rebekah.stewart.house@coleg.gov|303-866-2951
Tammy Story|House|25|Democrat|tammy.story.house@coleg.gov|303-866-2582
Larry Don Suckla|House|58|Republican|larry.suckla.house@coleg.gov|303-866-2955
Rick Taggart|House|55|Republican|rick.taggart.house@coleg.gov|303-866-3068
Brianna Titone|House|27|Democrat|brianna.titone.house@coleg.gov|303-866-2962
Alex Valdez|House|5|Democrat|alex.valdez.house@coleg.gov|303-866-2925
Elizabeth Velasco|House|57|Democrat|elizabeth.velasco.house@coleg.gov|303-866-2949
Ron Weinberg|House|51|Republican|ron.weinberg.house@coleg.gov|303-866-2947
Jenny Willford|House|34|Democrat|jenny.willford.house@coleg.gov|303-866-2931
Ty Winter|House|47|Republican|ty.winter.house@coleg.gov|303-866-2747
Steven Woodrow|House|2|Democrat|steven.woodrow.house@coleg.gov|303-866-2967
Dan Woog|House|19|Republican|dan.woog.house@coleg.gov|303-866-2924
Yara Zokaie|House|52|Democrat|yara.zokaie.house@coleg.gov|303-866-4569`;

const AG = {
  'Karen McCormick': 'House Ag/Water/Nat. Resources — Chair', 'Tisha Mauro': 'House Ag/Water/Nat. Resources — Vice Chair',
  'Lori Garcia Sander': 'House Ag/Water/Nat. Resources', 'Lori Goldstein': 'House Ag/Water/Nat. Resources',
  'Dusty Johnson': 'House Ag/Water/Nat. Resources', 'Mandy Lindsay': 'House Ag/Water/Nat. Resources',
  'Meghan Lukens': 'House Ag/Water/Nat. Resources', 'Matthew Martinez': 'House Ag/Water/Nat. Resources',
  'Lesley Smith': 'House Ag/Water/Nat. Resources', 'Katie Stewart': 'House Ag/Water/Nat. Resources',
  'Tammy Story': 'House Ag/Water/Nat. Resources', 'Larry Don Suckla': 'House Ag/Water/Nat. Resources',
  'Ty Winter': 'House Ag/Water/Nat. Resources',
  'Dylan Roberts': 'Senate Ag & Nat. Resources — Chair', 'Jessie Danielson': 'Senate Ag & Nat. Resources — Vice Chair',
  'Marc Catlin': 'Senate Ag & Nat. Resources', 'Nick Hinrichsen': 'Senate Ag & Nat. Resources',
  'Cathy Kipp': 'Senate Ag & Nat. Resources', 'Byron Pelton': 'Senate Ag & Nat. Resources',
  'Rod Pelton': 'Senate Ag & Nat. Resources',
};
const FLAG = new Set(['Mark Baisley', 'Dusty Johnson', 'Janice Rich']); // non-standard/personal email on official page

const stateLegRows = LEG_RAW.split('\n').map((line) => {
  const [name, chamber, district, party, email, phone] = line.split('|');
  const [first, last] = splitName(name);
  const verify = FLAG.has(name) ? 'VERIFY — non-standard/personal email on official page; confirm before mass email' : '';
  return [first, last, email, phone, chamber, district, party, AG[name] || '', verify];
});

const CDA = '305 Interlocken Parkway, Broomfield, CO 80021';
const FSA_ADDR = 'Denver Federal Center, Building 56, Room 2760, Lakewood, CO 80225';
const NRCS_ADDR = 'Denver Federal Center, Building 56, Room 2400, Denver, CO 80225 (Mail: PO Box 25426, Denver, CO 80225-0426)';

// Each list: { filename, header, rows }.
export const LISTS = {
  'state-legislature': {
    filename: 'ccga-co-state-legislature.csv',
    header: ['First Name', 'Last Name', 'Email Address', 'Phone', 'Chamber', 'District', 'Party', 'Ag Committee', 'Notes'],
    rows: stateLegRows,
  },
  governor: {
    filename: 'ccga-co-governors-office.csv',
    header: ['Office', 'Contact', 'Phone', 'Email Address', 'Address', 'Website'],
    rows: [
      ['Office of the Governor of Colorado', 'Front desk (main)', '(303) 866-2471', 'Governorpolis@state.co.us', 'State Capitol Building, 200 E. Colfax Ave., Rm. 136, Denver, CO 80203', 'https://governorsoffice.colorado.gov/contact-us'],
      ['Office of the Governor of Colorado', 'Constituent services help line', '(303) 866-2885', '', '', 'https://governorsoffice.colorado.gov/contact-us'],
      ['Office of the Lt. Governor of Colorado', "Lt. Governor's office", '(303) 866-4075', '', 'State Capitol Building, 200 E. Colfax Ave., Denver, CO 80203', 'https://governorsoffice.colorado.gov/contact-us'],
    ],
  },
  cda: {
    filename: 'ccga-co-dept-of-agriculture.csv',
    header: ['Division / Office', 'Name / Title', 'Phone', 'Email Address', 'Address'],
    rows: [
      ['Main Campus / Headquarters (general)', '', '(303) 869-9000', 'cda_info@state.co.us', CDA],
      ['Communications / Media', '', '', 'cda_communications@state.co.us', CDA],
      ["Commissioner's Office", 'Kate Greenberg, Commissioner (via Exec Asst Rachel Majich)', '(303) 869-9004', 'cda_communications@state.co.us (media)', CDA],
      ["Commissioner's Office", 'Hollis Glenn, Deputy Commissioner of Operations', '303-503-2668', 'hollis.glenn@state.co.us', CDA],
      ["Commissioner's Office", 'Jordan Beezley, Deputy Commissioner of External Affairs', '303-869-9011', 'jordan.beezley@state.co.us', CDA],
      ["Commissioner's Office", 'Madison Murphy, Chief Administrative Officer', '303-869-9002', 'madison.murphy@state.co.us', CDA],
      ["Commissioner's Office", 'Jennifer Hughes, Chief Financial Officer', '303-869-9020', 'jennifer.hughes@state.co.us', CDA],
      ["Commissioner's Office", 'Olga Robak, Director of Communications & Public Awareness', '720-428-0441', 'olga.robak@state.co.us', CDA],
      ["Commissioner's Office", 'Ruth DeCrescentis, Human Resources Director', '303-869-9012', 'ruth.decrescentis@state.co.us', CDA],
      ['Animal Health Division', 'Dr. Maggie Baldwin, State Veterinarian', '(303) 869-9130', 'animalhealth@state.co.us', CDA],
      ['Animal Welfare Division', '', '303-869-9172', '', CDA],
      ['Brand Inspection Division', 'Todd Inglee, Brand Commissioner', '303-869-9160', '', CDA],
      ['Conservation Services Division', 'Evanne Caviness, Director', '(303) 869-9030', 'agwaterquality@state.co.us / cda_soil@state.co.us / weeds@state.co.us (programs)', CDA],
      ['Inspection & Consumer Services Division', 'Mark Gallegos, Director', '303-869-9092', 'marka.gallegos@state.co.us', CDA],
      ['Division of Laboratory Services', 'Eric Petty, Director', '303-869-9220', 'eric.petty@state.co.us', '300 S. Technology Ct., Broomfield, CO 80021'],
      ['Markets Division', 'Amanda Laban, Director', '303-869-9170', 'amanda.laban@state.co.us', CDA],
      ['Division of Plant Industry', 'Wondirad Gebru, Director', '303-869-9050', 'wondirad.gebru@state.co.us / cda_plants@state.co.us', CDA],
      ['Colorado State Fair', '', '(719) 561-8484', '', '1001 Beulah Avenue, Pueblo, CO 81004'],
    ],
  },
  fsa: {
    filename: 'ccga-co-usda-fsa.csv',
    header: ['Office / Role', 'Name / Note', 'Phone', 'Email Address', 'Address'],
    rows: [
      ['Colorado FSA State Office', 'State office (main)', '720-544-2876', '', FSA_ADDR],
      ['State Executive Director', 'Jerry Sonnenberg', '720-544-2876', '', FSA_ADDR],
      ['State Committee — Chair', 'Donald Cleo Brown', '', '', FSA_ADDR],
      ['State Committee', 'Darrell Mackey', '', '', FSA_ADDR],
      ['State Committee', 'Kyle Dean McConnell', '', '', FSA_ADDR],
      ['State Committee', 'Joeseph Petrocco', '', '', FSA_ADDR],
      ['State Committee', 'Steve George Raftopoulos', '', '', FSA_ADDR],
      ['County / field offices', 'NOT RETRIEVED — USDA Service Center Locator (offices.usda.gov) was down (HTTP 504) on Nov 20, 2026; re-run when it is back up', '', '', ''],
    ],
  },
  nrcs: {
    filename: 'ccga-co-usda-nrcs.csv',
    header: ['Office / Role', 'Name / Note', 'Phone', 'Email Address', 'Address'],
    rows: [
      ['Colorado NRCS State Office', 'State office', '', '', NRCS_ADDR],
      ['Acting State Conservationist', 'Alyson Keaton', '970-534-2291', 'alyson.keaton@usda.gov', NRCS_ADDR],
      ['Executive Assistant', 'Lisa Hunt', '720-520-2767', 'lisa.hunt@usda.gov', NRCS_ADDR],
      ['Acting Asst State Conservationist, Management & Strategy', 'Sean Forehand', '970-361-3792', 'sean.forehand@usda.gov', NRCS_ADDR],
      ['Asst State Conservationist, Field Operations Area 2', 'Bailey Rapp', '970-590-5213', 'bailey.rapp@usda.gov', NRCS_ADDR],
      ['Asst State Conservationist, Field Operations Area 3', 'Deric Clemons', '720-601-3994', 'deric.clemons@usda.gov', NRCS_ADDR],
      ['Asst State Conservationist for Programs', 'Amber Freouf', '970-468-4744', 'amber.freouf@usda.gov', NRCS_ADDR],
      ['State Conservation Engineer', 'Rex Stambaugh', '720-544-2811', 'rex.stambaugh@usda.gov', NRCS_ADDR],
      ['Media / Public Affairs', 'Jennifer Rivera-San Antonio', '720-576-9285', 'jennifer.m.rivera-sanantonio@usda.gov', NRCS_ADDR],
      ['Field / service-center offices', 'NOT RETRIEVED — USDA Service Center Locator (offices.usda.gov) was down (HTTP 504) on Nov 20, 2026; re-run when it is back up', '', '', ''],
    ],
  },
};

// Buttons to show on the Officials tab (national is built from OFFICIALS in server.js).
export const DOWNLOADS = [
  { key: 'national', label: 'National congress' },
  { key: 'state-legislature', label: 'State legislature (100)' },
  { key: 'governor', label: "Governor's office" },
  { key: 'cda', label: 'Colorado Dept of Agriculture' },
  { key: 'fsa', label: 'USDA FSA (Colorado)' },
  { key: 'nrcs', label: 'USDA NRCS (Colorado)' },
];
