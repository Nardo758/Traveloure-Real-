/* Merged behavioural spec for service-creation-mock.html
   — the 87 create-flow / step-4-ruling assertions, adapted to console-shell navigation
   — plus the console-simulation and Gate G assertions, rebased onto the step-4 ruling
   Run: node verify.mjs                                          */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

/* playwright: resolved from the repo when run inside it, from the checkout otherwise */
let chromium;
try { ({ chromium } = await import('playwright')); }
catch { ({ chromium } = await import('/home/user/Traveloure-Real-/node_modules/playwright/index.mjs')); }

const DIR  = path.dirname(fileURLToPath(import.meta.url));
const PATH = path.join(DIR, 'service-creation-mock.html');
const FILE = 'file://' + PATH;
const EXE  = '/opt/pw-browsers/chromium/chrome-linux/chrome';
const EXE2 = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const SHOT = process.env.SHOTS ? path.join(DIR, 'mockshots') : null;
if (SHOT) fs.mkdirSync(SHOT, { recursive: true });

const errs = [], fails = [];
let count = 0;
const ok = (n, c, d = '') => {
  count++;
  if (!c) { fails.push(n); console.log('FAIL  ' + n + (d ? ' — ' + d : '')); }
};
const shot = async (p, name) => { if (SHOT) await p.screenshot({ path: path.join(SHOT, name), fullPage: true }); };

const browser = await chromium.launch({
  executablePath: fs.existsSync(EXE) ? EXE : (fs.existsSync(EXE2) ? EXE2 : undefined),
  args: ['--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
page.on('pageerror', e => errs.push('pageerror: ' + e.message));
await page.goto(FILE, { waitUntil: 'load' });

const view = () => page.evaluate(() => { const v = document.querySelector('.view.on'); return v ? v.id : null; });
const nav  = () => page.evaluate(() => { const n = document.querySelector('.sidenav .ni.on'); return n ? n.dataset.nav : null; });
const crumb = () => page.textContent('#crumbs');
const steps = () => page.$$eval('#steplist-ol li', els => els.map(e => e.textContent.replace(/^[\d✓]\s*/, '').trim()));
const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const go = n => page.click(`.sidenav .ni[data-nav="${n}"]`);
const openFlow = async () => { await go('workstation'); await page.click('#tile-single'); };
const cnt = s => page.locator(s).count();

/* ══════════════ 1. boot & console shell ══════════════ */
console.log('\n== 1. console shell ==');
ok('boot lands on Catalog', (await view()) === 'view-catalog', await view());
ok('boot lights the Catalog nav item', (await nav()) === 'catalog');
ok('sidebar has 11 nav items', (await cnt('.sidenav .ni')) === 11);
ok('sidebar groups Work / Business / Account',
  (await page.$$eval('.sidenav .ng', e => e.map(x => x.textContent.trim()))).join('|') === 'Work|Business|Account');
ok('Distribute carries the proposed (dashed) treatment', (await cnt('.sidenav .ni.proposed[data-nav="distribute"]')) === 1);
ok('persona in the top bar', (await page.textContent('.whoami')).includes('Aiko Tanaka')
  && (await page.textContent('.whoami')).includes('Machiya Kikuya · Gion, Kyoto · Provider'));
ok('mock badge present', /not connected to live data/i.test(await page.textContent('.mockbadge')));
ok('breadcrumb bar present', (await crumb()).includes('Catalog'));
ok('6 listing cards', (await cnt('#listings .listing')) === 6, String(await cnt('#listings .listing')));
ok('availability editor mounted beneath Catalog',
  (await cnt('#cat-avail-mount #avail-block .avlayout')) === 1 && await page.isVisible('#avail-block'));
ok('no body overflow at boot', (await overflow()) === 0, (await overflow()) + 'px');
await shot(page, '01-catalog.png');

console.log('\n== 2. every nav item renders something honest ==');
for (const n of ['dashboard','calendar','inbox','workstation','catalog','distribute','customers','performance','money','settings','playbook']) {
  await go(n);
  const v = await view(), lit = await nav();
  const vis = await page.evaluate(() => {
    const el = document.querySelector('.view.on');
    return el ? el.getBoundingClientRect().height > 40 : false;
  });
  ok(`nav ${n} → ${v} visible, nav lit`, !!v && vis && lit === n, `${v} / ${lit}`);
}
await go('inbox');
ok('unmocked pages share ONE honest stub', (await view()) === 'view-stub'
  && /Not part of this mock — unchanged by the redesign/.test(await page.textContent('#view-stub')));
ok('no body overflow after nav sweep', (await overflow()) === 0);

/* ══════════════ 3. create-flow branching (the step-4 ruling) ══════════════ */
console.log('\n== 3. delivery-method branching ==');
await openFlow();
ok('one door → create flow', (await view()) === 'view-create');
ok('crumb names the step', /Workstation.*New service.*Step 1/.test(await crumb()), await crumb());

const want = {
  in_person: ['Basics', 'Scheduling', 'Capacity', 'Logistics', 'Review & submit'],
  hybrid: ['Basics', 'Scheduling', 'Capacity', 'Logistics', 'Online half', 'Review & submit'],
  video: ['Basics', 'Session details', 'Review & submit'],
  call: ['Basics', 'Session details', 'Review & submit'],
  pdf: ['Basics', 'What they get', 'Review & submit'],
  voice_notes: ['Basics', 'Async details', 'Review & submit'],
  async_messaging: ['Basics', 'Async details', 'Review & submit'],
};
for (const [m, w] of Object.entries(want)) {
  await page.click('#steplist-ol li:first-child');
  await page.click(`.method[data-m="${m}"]`);
  const got = await steps();
  ok(`branch ${m} → ${w.length} steps`, JSON.stringify(got) === JSON.stringify(w), got.join(' · '));
}
await page.click('.method[data-m="pdf"]');
ok('pdf has no Logistics step', !(await steps()).includes('Logistics'));
let pdfAll = '';
for (const i of [1, 2, 3]) { await page.click(`#steplist-ol li:nth-child(${i})`); pdfAll += await page.textContent('#step-body'); }
ok('pdf flow never mentions meeting pin / radius / pickup', !/meeting pin|travel radius|pickup/i.test(pdfAll));
ok('authoring canvas hidden on pdf', (await page.getAttribute('#author-host', 'hidden')) !== null);

/* ══════════════ 4. step 4 = Logistics, and the authoring component lives there ══════════════ */
console.log('\n== 4. step 4 · Logistics ==');
await page.click('#steplist-ol li:first-child');
await page.click('.method[data-m="in_person"]');
await page.click('#steplist-ol li:nth-child(4)');
ok('step 4 is titled Logistics', (await page.textContent('#step-title')).startsWith('Logistics'));
ok('step hint says 4 of 5', (await page.textContent('#step-hint')) === 'Step 4 of 5');
ok('crumb reads Step 4 · Logistics', /Step 4 · Logistics/.test(await crumb()), await crumb());
ok('authoring canvas mounted in the step', await page.isVisible('#author-host #bigmap'));
await page.click('#steplist-ol li:nth-child(2)');
ok('renamed note on Scheduling', (await page.textContent('#step-body')).includes('renamed — amend if you prefer'));
ok('Scheduling says it was Logistics', (await page.textContent('#step-body')).includes('Previously called'));
await page.click('#steplist-ol li:nth-child(3)');
ok('renamed note on Capacity', (await page.textContent('#step-body')).includes('renamed — amend if you prefer'));
await page.click('#steplist-ol li:nth-child(4)');

await page.click('#bigmap', { position: { x: 400, y: 300 } });
ok('bare map click places nothing', (await cnt('#bigmap-overlay .mk')) === 2, 'markers ' + (await cnt('#bigmap-overlay .mk')));
ok('bare click explains itself', /did nothing/.test(await page.textContent('#armbar-text')));
await page.click('#arm-pin');
await page.click('#bigmap', { position: { x: 400, y: 300 } });
ok('candidate pin needs confirmation', (await cnt('#pin-confirm')) === 1);
ok('radius refuses to draw without a confirmed pin', (await page.textContent('#radius-slot')).includes('Needs a confirmed pin'));
await page.click('#pin-confirm');
ok('pin confirmed', (await page.textContent('#pin-pill')) === 'Confirmed');
ok('radius control appears after confirm', await page.isVisible('#map-radius'));
await page.$eval('#map-radius', el => { el.value = 14; el.dispatchEvent(new Event('input', { bubbles: true })); });
ok('radius value follows the slider', (await page.textContent('#radius-slot')).includes('14 km'));
await page.click('#tog-zones');
ok('zone rings render', (await cnt('#bigmap-overlay .ring.zone1')) === 1);
ok('zone toggle reflects its state', (await page.getAttribute('#tog-zones', 'aria-pressed')) === 'true');
ok('zone amounts point at Pricing & fees', (await page.textContent('#author-host')).includes('display only'));
ok('stops pill honest (2 of 3)', (await page.textContent('#stops-pill')) === '2 of 3 located');
await page.click('#rail-add-stop');
ok('added stop is unlocated', (await page.textContent('#stops-pill')) === '2 of 4 located');
await page.click('#rail-stops .stoprow:nth-child(3) [data-mv]');
await page.click('#bigmap', { position: { x: 250, y: 260 } });
ok('placing a stop locates it', (await page.textContent('#stops-pill')) === '3 of 4 located');
ok('sequence-not-routing stated', (await page.textContent('#map-caption')).includes('sequence, not travel routing'));
ok('ODbL attribution on the authoring map', (await page.textContent('#author-host .mapattr')).includes('OpenStreetMap'));
ok('authoring map labelled illustrative', (await page.textContent('#author-host')).includes('Map preview — illustrative'));
ok('pickup toggle on step 4', await page.isVisible('#pickup-toggle'));
await page.click('#pickup-toggle');
ok('pickup fields revealed in step 4', (await page.textContent('#step-body')).includes('Drop-off'));
await shot(page, '02-step4-logistics.png');

await page.click('#steplist-ol li:nth-child(5)');
const rev = await page.textContent('#step-body');
ok('review reflects the confirmed pin', rev.includes('pin confirmed'));
ok('review reflects the radius', rev.includes('14 km'));
ok('review reflects located stops', /3 of 4 located/.test(rev));
ok('review names step 4', rev.includes('step 4'));
ok('review offers Submit for review, never Publish', (await page.textContent('#review-submit')).includes('Submit for review'));

/* ══════════════ 5. save draft → listing home → checklist ══════════════ */
console.log('\n== 5. Catalog → Add New Service → one door → flow → draft → listing home ==');
await go('catalog');
await page.click('#cat-add');
ok('Add New Service → Workstation one door', (await view()) === 'view-workstation'
  && (await page.textContent('#view-workstation')).includes('What are you building?'));
ok('crumb = Workstation', (await crumb()).includes('Workstation'));
ok('bundle tile honestly locked', (await page.textContent('#tile-bundle-slot')).includes('Unlocks when you have 2 approved services'));
await page.click('#tile-single');
await page.click('#steplist-ol li:first-child');
await page.click('#btn-next');
ok('Save draft → listing home', (await view()) === 'view-listing');
ok('listing home says the listing is saved', (await page.textContent('#view-listing')).includes('Your listing is saved'));
ok('crumb = Workstation › New service › Listing home', /Listing home/.test(await crumb()), await crumb());
ok('checklist heading derived', /before review/.test(await page.textContent('#checklist-heading')));
await shot(page, '03-listing-home.png');

/* cover-photo row → photos drawer → add → ticks itself from state */
await page.click('#checklist [data-check="photo"]');
ok('photo row opens the photos drawer', (await cnt('#photo-drawer.on')) === 1);
ok('photos drawer offers a protected upload dropzone (gap #16)',
  (await page.textContent('#photo-drop')).includes('platform-protected'));
ok('photos drawer keeps an honest URL fallback',
  (await cnt('#photo-url')) === 1 && /cannot vouch for it/.test(await page.textContent('#photo-drawer')));
await page.click('#photo-add');
await page.click('#photo-done');
ok('photo row ticks from state, not from the click',
  (await page.getAttribute('#checklist [data-check="photo"]', 'aria-checked')) === 'true');

const clText = await page.textContent('#checklist');
ok('location row names step 4', clText.includes('step 4, Logistics'));
ok('location row ticks from the authoring state',
  (await page.getAttribute('#checklist [data-check="where"]', 'aria-checked')) === 'true');
ok('safety row points at Scheduling', clText.includes('Scheduling step'));
await page.click('#checklist [data-check="safety"]');
ok('safety row lands on Scheduling', (await page.textContent('#step-title')).startsWith('Scheduling'));
await go('catalog');
await page.click('#listings .listing:nth-child(2) [data-edit]');
await page.click('#checklist [data-check="where"]');
ok('location row lands on step 4', (await page.textContent('#step-title')).startsWith('Logistics') && await page.isVisible('#bigmap'));
await page.click('#pin-confirm-slot #pin-remove');
ok('removing the pin unticks the row (one state, not two)',
  await page.evaluate(() => {
    const r = document.querySelector('#checklist [data-check="where"]');
    return r && r.getAttribute('aria-checked') === 'false';
  }));
await page.click('#arm-pin');
await page.click('#bigmap', { position: { x: 380, y: 280 } });
await page.click('#pin-confirm');

/* ══════════════ 6. availability engine (gap #2) ══════════════ */
console.log('\n== 6. availability editor — the real date engine ==');
await go('catalog');
await page.click('#listings .listing:nth-child(2) [data-edit]');
await page.click('#checklist [data-check="avail"]');
ok('availability row → Catalog', (await view()) === 'view-catalog');
ok('availability crumb', /Availability/.test(await crumb()), await crumb());
ok('availability listing pre-selected',
  await page.evaluate(() => document.querySelector('#av-pick button[aria-pressed="true"]').textContent.includes('Gion Evening Food Walk')));
ok('deep link flashes the block', (await cnt('#avail-block.flash')) === 1);
ok('proposed chip on the availability editor',
  (await page.textContent('#avail-block .propchip')).includes('gap #2'));
ok('grid opens on the month with availability', (await page.textContent('#cal-title')) === 'August 2026',
  await page.textContent('#cal-title'));
ok('next-available jump chip', (await page.textContent('#av-next-avail')).startsWith('Next available:'),
  await page.textContent('#av-next-avail'));
ok('weekly repeat pattern for a scheduled listing', (await cnt('#av-days .daychip')) === 7 && (await cnt('#av-start')) === 1);
ok('seeded pattern days are Tue + Thu',
  (await page.$$eval('#av-days .daychip[aria-pressed="true"]', e => e.map(x => x.textContent))).join(',') === 'Tu,Th');
ok('one-off slot seeded and marked * on the grid',
  (await cnt('#av-oneoffs .minirow')) === 1 && (await page.textContent('#cal-body')).includes('*'));
ok('seeded blackout punches visible holes', (await cnt('#cal-body .cell.block')) === 4,
  'blocked ' + (await cnt('#cal-body .cell.block')));
ok('seeded blackout is named on the grid', (await page.textContent('#cal-body')).includes('Closed for Obon'));
await shot(page, '04-availability.png');

const open0  = await cnt('#cal-body .cell.open');
const block0 = await cnt('#cal-body .cell.block');
await page.fill('#av-bl-label', 'Test block');
await page.fill('#av-bl-from', '2026-08-18');
await page.fill('#av-bl-to', '2026-08-27');
await page.click('#av-add-bl');
const open1  = await cnt('#cal-body .cell.open');
const block1 = await cnt('#cal-body .cell.block');
ok('a blackout SUBTRACTS — it punches holes', block1 > block0 && open1 < open0, `${block0}/${open0} → ${block1}/${open1}`);
ok('the new blackout is listed by name', (await page.textContent('#av-blackouts')).includes('Test block'));
await page.locator('#av-blackouts [data-rmbl]').last().click();
ok('removing a blackout restores the days EXACTLY',
  (await cnt('#cal-body .cell.open')) === open0 && (await cnt('#cal-body .cell.block')) === block0,
  `${await cnt('#cal-body .cell.block')}/${await cnt('#cal-body .cell.open')}`);
ok('blackout rail states it is subtractive', (await page.textContent('#av-right')).includes('subtracts'));
await page.click('#av-add-oneoff');
ok('a one-off can be added', (await cnt('#av-oneoffs .minirow')) === 2);

await page.click('#av-pick button:nth-child(2)');
ok('property room selected', await page.evaluate(() =>
  document.querySelector('#av-pick button[aria-pressed="true"]').textContent.includes('Tatami Room')));
ok('room grid opens where its dates are', (await page.textContent('#cal-title')) === 'September 2026',
  await page.textContent('#cal-title'));
ok('a room publishes date RANGES, not weekly chips', (await cnt('#av-ranges .minirow')) === 1 && (await cnt('#av-days')) === 0);
ok('nightly price is carried by the range', (await page.textContent('#cal-body')).includes('$180 / night'));
ok('room rail explains range-not-slot', (await page.textContent('#av-right')).includes('by the night across a range'));
await page.click('#av-pick button:nth-child(3)');
ok('a thing that sells without a calendar says so',
  await page.isVisible('#av-nocal') && (await page.textContent('#av-nocal')).includes('No calendar — this sells without slots'));
ok('no month grid is rendered for it', (await cnt('#cal-body .cell')) === 0 && !(await page.isVisible('#av-cal-card')));
await page.click('#av-pick button:nth-child(1)');

/* ══════════════ 7. Catalog map = traveler preview ONLY ══════════════ */
console.log('\n== 7. Catalog map · traveler preview ==');
await go('catalog');
ok('catalog opens in list mode', await page.isVisible('#cat-list-mode'));
await page.click('#cat-mode-seg [data-mode="map"]');
ok('map mode shows the traveler preview', await page.isVisible('#travelmap'));
ok('list mode hidden in map mode', !(await page.isVisible('#cat-list-mode')));
ok('availability block hidden in map mode', !(await page.isVisible('#avail-block')));
ok('crumb = Map · Traveler preview', /Traveler preview/.test(await crumb()), await crumb());
const catMapTxt = await page.textContent('#cat-map-mode');
ok('labelled read-only traveler preview', /Traveler preview — read-only/.test(catMapTxt));
ok('records the amendment', /amends/.test(catMapTxt));
ok('ZERO authoring controls on Catalog',
  (await cnt('#cat-map-mode #arm-pin, #cat-map-mode .armbar, #cat-map-mode input[type=range], #cat-map-mode [data-mv], #cat-map-mode #pin-confirm')) === 0);
ok('no Authoring | Traveler sub-toggle anywhere',
  !(await page.$$eval('.seg button', b => b.map(x => x.textContent))).some(t => /author/i.test(t)));
ok('only ONE authoring canvas in the file', (await cnt('#bigmap')) === 1);
ok('traveler preview shows the confirmed listing', (await cnt('#travelmap-overlay .mk')) === 3,
  'pins ' + (await cnt('#travelmap-overlay .mk')));
ok('honest located count', /3 of 3 place-anchored listings located/.test(await page.textContent('#travelmap-caption')),
  await page.textContent('#travelmap-caption'));
ok('remote listings named, not counted missing', (await page.textContent('#travelmap-unlocated')).includes('it happens nowhere'));
ok('ODbL on the traveler preview', (await page.textContent('#cat-map-mode .mapattr')).includes('OpenStreetMap'));
ok('no-coordinates-no-map demonstrated', (await page.textContent('#cat-map-mode')).includes('No coordinates — no map'));
ok('gap #13 panel rendered on the preview',
  (await page.textContent('#render-it')).includes('Render it, or stop collecting it')
  && (await page.textContent('#render-it .propchip')).includes('gap #13'));
ok('gap #13 shows traveler-side answers', (await page.textContent('#render-it')).includes('Party size')
  && (await page.textContent('#render-it')).includes('Getting there')
  && (await page.textContent('#render-it')).includes('Travel fee'));
ok('gap #13 names the deliberately provider-only set', (await page.textContent('#render-it')).includes('Deliberately provider-only'));
await shot(page, '05-traveler-preview.png');

await page.click('#cat-to-step4');
ok('preview links back into step 4', (await page.textContent('#step-title')).startsWith('Logistics'));
await page.click('#pin-confirm-slot #pin-remove');
await go('catalog');
await page.click('#cat-mode-seg [data-mode="map"]');
ok('an unlocated listing drops off the map, into the rail', (await cnt('#travelmap-overlay .mk')) === 2);
ok('the rail offers the step-4 fix path', (await page.textContent('#travelmap-unlocated')).includes('Fix it in step 4'));
await page.click('#travelmap-unlocated [data-fixloc]');
ok('rail fix path lands on step 4', (await page.textContent('#step-title')).startsWith('Logistics'));
await page.click('#arm-pin');
await page.click('#bigmap', { position: { x: 380, y: 280 } });
await page.click('#pin-confirm');

/* ══════════════ 8. Catalog cards: edit / promote ══════════════ */
console.log('\n== 8. Catalog cards → listing home, Distribute ==');
await go('catalog');
await page.click('#listings .listing:nth-child(1) [data-edit]');
ok('food-walk Edit → listing home', (await view()) === 'view-listing');
ok('name follows through to the hero', (await page.textContent('#draft-hero-sub')).includes('Gion Evening Food Walk'));
ok('price follows through to the hero', (await page.textContent('#draft-hero-sub')).includes('$52 per person'));
ok('live pill', (await page.textContent('#draft-pill')) === 'Live');
ok('a live listing submits CHANGES for review', (await page.textContent('#btn-submit-review')).includes('changes'));
ok('crumb = Catalog › listing', /Catalog/.test(await crumb()) && /Gion Evening Food Walk/.test(await crumb()), await crumb());
ok('name follows through to the checklist done-list', (await page.textContent('#donelist')).includes('Gion Evening Food Walk'));
await page.click('#open-pricing');
ok('price follows through to the pricing drawer', (await page.inputValue('#pf-base')) === '$52 per person');
await page.click('#drawer-close');
await page.click('#steplist-ol li:first-child').catch(() => {});
await go('catalog');
await page.click('#listings .listing:nth-child(1) [data-edit]');
await page.click('#checklist [data-check="desc"]');
ok('name follows through into the flow', (await page.inputValue('#basics-name')) === 'Gion Evening Food Walk');
await page.click('#steplist-ol li:last-child');
ok('name follows through to review', (await page.textContent('#step-body')).includes('Gion Evening Food Walk'));
await shot(page, '06-edit-live.png');

await go('catalog');
await page.click('#listings .listing:nth-child(3) [data-edit]');
ok('a PDF card carries its own delivery method', (await steps()).join('|') === 'Basics|What they get|Review & submit');
ok('PDF card name follows through', (await page.textContent('#draft-hero-sub')).includes('Tokyo Like a Local'));
await go('catalog');
await page.click('#listings .listing:nth-child(5) [data-edit]');
ok('a property ROOM edits in the property builder, not a service checklist',
  (await view()) === 'view-property' && (await page.textContent('#prop-body')).includes('bookable listing under this property'));

await go('catalog');
await page.click('#listings .listing:nth-child(1) [data-promote]');
ok('Promote this → Distribute', (await view()) === 'view-distribute');
ok('promote banner names the listing', (await page.textContent('#dist-promote')).includes('Gion Evening Food Walk'));
ok('Distribute blocks are tagged as moved from Catalog',
  (await page.$$eval('#view-distribute .pill', e => e.filter(x => /moves here from Catalog/.test(x.textContent)).length)) === 3);
ok('Distribute keeps measurement on Performance', (await page.textContent('#view-distribute')).includes('Measurement stays on Performance'));
await shot(page, '07-distribute.png');
await page.click('#dist-back');
ok('banner back → Catalog', (await view()) === 'view-catalog');
await go('distribute');
ok('nav-reached Distribute has no promoting banner', !(await page.isVisible('#dist-promote')));

/* ══════════════ 9. Calendar (read-only) ══════════════ */
console.log('\n== 9. Calendar ==');
await go('calendar');
ok('calendar is read-only and says so', (await page.textContent('#view-calendar')).includes('Read-only'));
ok('calendar states the recommendation and the amendment on offer',
  (await page.textContent('#cal-recommendation')).includes('G1 recommendation')
  && (await page.textContent('#cal-recommendation')).includes('amendment on offer'));
const chips = await cnt('#rocal-body .evchip');
ok('calendar has seeded chips', chips > 0, 'chips ' + chips);
ok('blackouts show as their own chip kind', (await cnt('#rocal-body .evchip.blk')) === 4);
await shot(page, '08-calendar.png');
await page.locator('#rocal-body .evchip').first().click();
ok('chip → Catalog availability editor', (await view()) === 'view-catalog' && await page.isVisible('#avail-block'));
ok('chip deep link pre-selects the listing', await page.evaluate(() =>
  document.querySelector('#av-pick button[aria-pressed="true"]').textContent.includes('Gion Evening Food Walk')));
ok('chip deep link keeps the month on screen', (await page.textContent('#cal-title')) === 'August 2026');

/* ══════════════ 10. property builder (gap #1) ══════════════ */
console.log('\n== 10. property builder ==');
await go('workstation');
await page.click('#tile-property');
ok('property builder opens', (await view()) === 'view-property' && await page.isVisible('#door-property'));
ok('proposed chip on the property builder', (await page.textContent('#door-property .propchip')).includes('gap #1'));
ok('crumb names the step', /New property.*1\. The property/.test(await crumb()), await crumb());
const p1 = await page.textContent('#prop-body');
ok('step 1 collects property basics',
  ['Property name','Description','Photos','Check-in from','Check-out by','Minimum stay','House rules','Amenities']
    .every(t => p1.includes(t)), p1.slice(0, 80));
ok('stay-shaped cancellation, not the session policy', p1.includes('a night is not a slot'));
ok('6 amenities', (await cnt('#prop-amen .amenrow')) === 6);
const photos0 = await cnt('#prop-body .photobox:not(.photoadd)');
await page.click('#prop-photo-add');
ok('the photo strip really adds', (await cnt('#prop-body .photobox:not(.photoadd)')) === photos0 + 1);
await page.click('#prop-amen [data-amen="parking"]');
ok('amenity toggles', (await page.getAttribute('#prop-amen [data-amen="parking"]', 'aria-checked')) === 'true');
await shot(page, '09-property-1.png');

await page.click('#prop-next');
ok('crumb step 2', /2\. Rooms/.test(await crumb()), await crumb());
ok('rooms are child rows', (await cnt('#prop-rooms .roomcard')) === 2);
ok('each room becomes its own bookable listing',
  (await page.textContent('#prop-body')).includes('Each room becomes its own bookable listing under this property'));
ok('a room carries name, sleeps, nightly price and a photo',
  (await cnt('[data-rname]')) === 2 && (await cnt('[data-rsleeps]')) === 2
  && (await cnt('[data-rprice]')) === 2 && (await cnt('[data-rphoto]')) === 2);
await page.click('#prop-add-room');
ok('a room can be added', (await cnt('#prop-rooms .roomcard')) === 3);
await page.locator('[data-rmroom]').last().click();
ok('a room can be removed', (await cnt('#prop-rooms .roomcard')) === 2);
await page.fill('[data-rname="1"]', 'The Garden Room — north');
ok('a room can be edited', (await page.inputValue('[data-rname="1"]')) === 'The Garden Room — north');
await shot(page, '10-property-2.png');

await page.click('#prop-next');
ok('crumb step 3', /3\. Review/.test(await crumb()), await crumb());
const p3 = await page.textContent('#prop-body');
ok('review is honest about bookability', p3.includes('Not yet bookable — no date ranges published'));
ok('review carries the edited room name', p3.includes('The Garden Room — north'));
await page.click('#prop-to-avail');
ok('review deep-links into Availability', (await view()) === 'view-catalog' && await page.isVisible('#avail-block'));
ok('room pre-selected in the editor', await page.evaluate(() =>
  document.querySelector('#av-pick button[aria-pressed="true"]').textContent.includes('Tatami Room')));

/* ══════════════ 10b. property location — the pin (gap #1) ══════════════ */
console.log('\n== 10b. property location (gap #1 · pin) ==');
await go('workstation');
await page.click('#tile-property');
const pinned = () => cnt('#propmap-overlay .mk');

const pb0 = await page.textContent('#prop-body');
ok('property basics carries a “Where is it” section', pb0.includes('Where is it') && (await cnt('#propmap')) === 1);
ok('the section is chipped as proposed gap #1',
  (await page.$$eval('#prop-body .propchip', e => e.map(x => x.textContent))).filter(t => /gap #1 · ratify or amend/.test(t)).length >= 2);
ok('it is the flow’s own pin component reused, not a second location rail',
  pb0.includes('same confirm-gated pin') && pb0.includes('One sanctioned location write, reused'));
ok('property map is labelled illustrative and carries ODbL attribution',
  (await page.textContent('#propmap .maplabel')).includes('illustrative')
  && (await page.textContent('#propmap .mapattr')).includes('© OpenStreetMap contributors'));
ok('seeded UNPINNED so the placement is experienced', (await page.textContent('#prop-pin-pill')).trim() === 'Not placed'
  && (await pinned()) === 0);
ok('unpinned says so, and says rooms inherit it',
  (await page.textContent('#prop-pin-slot')).includes('Not yet locatable')
  && (await page.textContent('#prop-pin-slot')).includes('neither are its rooms'));

ok('address line is optional and empty by default', (await page.inputValue('#prop-addr')) === '');
ok('address placeholder is Kyoto-appropriate',
  (await page.getAttribute('#prop-addr', 'placeholder')) === 'e.g. Shimbashi-dori, Gion');
ok('address is labelled display text shown to guests', pb0.includes('shown to guests'));
ok('no geocoding guess — the pin is authoritative',
  pb0.includes('never guess coordinates from text') && pb0.includes('geocode poorly'));

ok('privacy panel renders BOTH states, not just describes them',
  (await cnt('#priv-ill-before .privmini')) === 1 && (await cnt('#priv-ill-after .privmini')) === 1);
ok('pre-booking illustration is an approximate area circle',
  (await cnt('#priv-ill-before .ring.approx')) === 1
  && (await page.textContent('#priv-ill-before')).includes('approximate area')
  && (await page.textContent('#priv-ill-before')).includes('exact location after booking'));
ok('post-booking illustration is the exact pin',
  (await cnt('#priv-ill-after .mk')) === 1 && (await cnt('#priv-ill-after .ring.approx')) === 0);
ok('privacy toggle starts on the pre-booking state',
  (await page.getAttribute('#prop-priv-seg [data-priv="before"]', 'aria-pressed')) === 'true'
  && (await cnt('#priv-ill-before.on')) === 1);
await page.click('#prop-priv-seg [data-priv="after"]');
ok('privacy toggle switches which state is inspected',
  (await cnt('#priv-ill-after.on')) === 1 && (await cnt('#priv-ill-before.on')) === 0
  && (await page.textContent('#prop-priv-cap')).includes('post-booking'));
ok('both illustrations stay on screen after the toggle',
  (await cnt('#priv-ill-before .privmini')) === 1 && (await cnt('#priv-ill-after .privmini')) === 1);

/* the confirm gate, exactly as step 4 */
await page.click('#propmap', { position: { x: 320, y: 190 } });
ok('a BARE map click places nothing', (await pinned()) === 0
  && (await page.textContent('#prop-armbar-text')).includes('did nothing'));
await page.click('#prop-arm-pin');
ok('arming says what a click will do', (await page.textContent('#prop-armbar-text')).includes('Armed')
  && (await cnt('#prop-armbar.arm')) === 1);
await page.click('#propmap', { position: { x: 320, y: 190 } });
ok('an armed click places a CANDIDATE pin, unconfirmed', (await pinned()) === 1
  && (await page.textContent('#prop-pin-pill')).trim() === 'Unconfirmed'
  && (await page.textContent('#prop-pin-slot')).includes('not saved'));
ok('arming does not persist after a placement', (await cnt('#prop-armbar.arm')) === 0);
await page.click('#prop-pin-discard');
ok('Discard restores the unplaced state exactly', (await pinned()) === 0
  && (await page.textContent('#prop-pin-pill')).trim() === 'Not placed');

/* an unconfirmed pin is not a location — the review must still refuse */
await page.click('#prop-arm-pin');
await page.click('#propmap', { position: { x: 300, y: 170 } });
await page.click('#prop-step-seg [data-ps="1"]');
ok('rooms step states the inheritance',
  (await page.textContent('#prop-inherit-rooms')).includes('All rooms take their location from the property pin')
  && (await page.textContent('#prop-inherit-rooms')).includes('one placement locates the whole house'));
ok('rooms step flags the missing pin while it is unconfirmed',
  (await page.textContent('#prop-inherit-rooms')).includes('no room is locatable'));
await page.click('#prop-step-seg [data-ps="2"]');
ok('review shows “Not yet locatable — drop the pin” while unpinned',
  (await page.textContent('#prop-loc-row')).includes('Not yet locatable — drop the pin'));
ok('review keeps the separate no-dates row beside it',
  (await page.textContent('#prop-body')).includes('Not yet bookable — no date ranges published'));
ok('review states the inheritance too',
  (await page.textContent('#prop-inherit-review')).includes('All rooms take their location from the property pin'));
ok('review completes with NO address line — it is optional',
  (await page.textContent('#prop-loc-sumrow')).includes('No directions line')
  && await page.isEnabled('#prop-submit'));

await page.click('#prop-step-seg [data-ps="0"]');
ok('the candidate pin survived the step change, still unconfirmed',
  (await pinned()) === 1 && (await page.textContent('#prop-pin-pill')).trim() === 'Unconfirmed');
await page.click('#prop-pin-confirm');
ok('Confirm stores the location', (await page.textContent('#prop-pin-pill')).trim() === 'Confirmed'
  && (await page.textContent('#prop-pin-slot')).includes('Every room inherits this'));
ok('a confirmed pin draws the approximate area on the canvas', (await cnt('#propmap-overlay .ring.approx')) === 1);
await page.fill('#prop-addr', 'Shimbashi-dori, Gion — the machiya with the black lattice');
await shot(page, '11-property-location.png');

await page.click('#prop-step-seg [data-ps="1"]');
ok('rooms step drops the missing-pin warning once pinned',
  !(await page.textContent('#prop-inherit-rooms')).includes('no room is locatable'));
await page.click('#prop-step-seg [data-ps="2"]');
ok('pinning CLEARS the not-locatable row',
  !(await page.textContent('#prop-loc-row')).includes('Not yet locatable')
  && (await page.textContent('#prop-loc-row')).includes('Located'));
ok('review reports the pin and the optional directions line',
  (await page.textContent('#prop-loc-sumrow')).includes('Pin confirmed')
  && (await page.textContent('#prop-loc-sumrow')).includes('the machiya with the black lattice'));
ok('the no-dates row is untouched by the pin — two different refusals',
  (await page.textContent('#prop-body')).includes('Not yet bookable — no date ranges published'));
await page.click('#notes-open');
ok('mock notes legend gained the “Where is it” callout dot',
  (await page.textContent('#notes')).includes('Where is it')
  && (await page.textContent('#notes')).includes('never a second location rail'));
await page.click('#notes-close');

/* ══════════════ 11. bundle builder (gap #9) ══════════════ */
console.log('\n== 11. bundle builder ==');
await go('workstation');
ok('bundle tile locked by default', (await cnt('#tile-bundle-slot .doortile.locked')) === 1);
await page.click('#bundle-preview');
ok('“Preview as unlocked” reveals the tile', (await cnt('#tile-bundle')) === 1);
await page.click('#tile-bundle');
ok('bundle builder opens', (await view()) === 'view-bundle' && await page.isVisible('#door-bundle'));
ok('proposed chip on the bundle builder', (await page.textContent('#door-bundle .propchip')).includes('gap #9'));
ok('component picker over approved listings', (await cnt('[data-comp]')) === 4);
ok('picked components become numbered linked rows', (await cnt('#bundle-rows .stop')) === 2);
ok('components stay linked to the originals', (await page.textContent('#bundle-body')).includes('stay linked to the originals'));
ok('delivery method is DERIVED', (await page.inputValue('#bundle-method')) === 'In person'
  && (await page.textContent('#bundle-body')).includes('Derived, not chosen'));
ok('derivation is stated in words', (await page.textContent('#bundle-body')).includes('Every component is “In person”, so the bundle is too'));
ok('components total stated as fact, not as a saving',
  (await page.textContent('#bundle-body')).includes('Components total') &&
  (await page.textContent('#bundle-body')).includes('you set the bundle price') &&
  !/save|discount of|you save/i.test(await page.textContent('#bundle-body')));
ok('no auto-sum: the price field is not the components total',
  (await page.inputValue('#bundle-price')) === '92');
await page.click('[data-comp="call"]');
ok('a mixed bundle derives Hybrid', (await page.inputValue('#bundle-method')) === 'Hybrid');
ok('mixed derivation is explained', /Components mix .* so the bundle is/.test(await page.textContent('#bundle-body')));
await page.click('[data-comp="call"]');
ok('bundle availability is the intersection', (await page.textContent('#bundle-body')).includes('Availability is the intersection'));
await shot(page, '11-bundle.png');
await page.click('#bundle-back');
ok('bundle back → Workstation', (await view()) === 'view-workstation');
await page.click('#bundle-preview');
ok('the locked state is inspectable again', (await cnt('#tile-bundle-slot .doortile.locked')) === 1);

/* ══════════════ 12. session & async branches (gaps #4 / #3) ══════════════ */
console.log('\n== 12. session & async branches ==');
await openFlow();
await page.click('.method[data-m="video"]');
await page.click('#steplist-ol li:nth-child(2)');
const sess = await page.textContent('#step-body');
ok('session step carries its proposed chip', (await page.textContent('#step-body .propchip')).includes('gap #4'));
const tzOpts = await page.$$eval('#sess-tz option', e => e.map(x => x.textContent));
ok('friendly timezone picker', tzOpts[0] === 'Japan (GMT+9)' && !tzOpts.some(t => t.includes('/')), tzOpts.join('|'));
ok('timezone is named the way a person would say it', sess.includes('not “Asia/Tokyo”'));
await page.selectOption('#sess-venue', 'own');
ok('“my own link” reveals a link field', (await cnt('#sess-link')) === 1);
ok('the link is shared only after booking',
  (await page.textContent('#step-body')).includes('Shared with the traveler only after booking'));
ok('1-on-1 / group capacity segment', (await cnt('#sess-cap [data-cap]')) === 2);
await page.click('#sess-cap [data-cap="group"]');
ok('group capacity reveals a seat count', (await page.textContent('#step-body')).includes('people on the call'));
await page.click('#steplist-ol li:first-child');
await page.click('#btn-next');
ok('session branch produces a real derived checklist row', (await cnt('#checklist [data-check="session"]')) === 1);
ok('the row is honestly unticked while the own-link is empty',
  (await page.getAttribute('#checklist [data-check="session"]', 'aria-checked')) === 'false');
await page.click('#checklist [data-check="session"]');
ok('the row lands on Session details', (await page.textContent('#step-title')).startsWith('Session details'));
await page.fill('#sess-link', 'https://meet.example.com/aiko-kyoto');
await page.click('#steplist-ol li:first-child');
await page.click('#btn-next');
ok('the row ticks once the link exists',
  (await page.getAttribute('#checklist [data-check="session"]', 'aria-checked')) === 'true');
await shot(page, '12-session.png');

await openFlow();
await page.click('.method[data-m="async_messaging"]');
await page.click('#steplist-ol li:nth-child(2)');
const asy = await page.textContent('#step-body');
ok('async step carries its proposed chip', (await page.textContent('#step-body .propchip')).includes('gap #3'));
ok('reply-window selector', (await cnt('#async-reply [data-reply]')) === 3);
ok('reply window echoed in traveler-facing copy', (await page.textContent('#async-echo')).includes('Replies within 24 hours'));
await page.click('#async-reply [data-reply="4h"]');
ok('the echo follows the selection', (await page.textContent('#async-echo')).includes('Replies within 4 hours'));
ok('scope statement stands in for a duration', asy.includes('What is included in one exchange?')
  && asy.includes('stands in for a duration'));
ok('engagement window asked', asy.includes('Runs for') && asy.includes('days from first message'));
ok('completion wired to the provider-declared rule',
  asy.includes('you mark it complete, and the traveler has a dispute window'));
ok('async branch does not borrow the PDF upload step', !/Upload the file/.test(asy));
await page.click('#steplist-ol li:first-child');
await page.click('#btn-next');
ok('async branch produces a real derived checklist row', (await cnt('#checklist [data-check="async"]')) === 1);
ok('scope row ticks from the scope text',
  (await page.getAttribute('#checklist [data-check="async"]', 'aria-checked')) === 'true');
await shot(page, '13-async.png');

/* ══════════════ 13. gap batch: #17 edit split, #18 archive ══════════════ */
console.log('\n== 13. gap batch — editing live, delete with bookings ==');
await go('catalog');
await page.click('#listings .listing:nth-child(1) [data-edit]');
const split = await page.textContent('#edit-split');
ok('editing-a-live-listing split rendered (gap #17)',
  split.includes('Goes live immediately') && split.includes('Re-enters review'));
ok('gap #17 chip', (await page.textContent('#edit-split .propchip')).includes('gap #17'));
ok('price / photos / availability go live immediately',
  ['Price and pricing settings','Photos and gallery order','Availability, slots and blackouts']
    .every(t => split.includes(t)));
ok('name / category / delivery method re-enter review',
  ['Listing name','Category and offering','Delivery method'].every(t => split.includes(t)));
ok('Live + Edit in review dual pill, nothing taken down',
  (await cnt('#dual-pill-note .pill.live')) === 1 && (await cnt('#dual-pill-note .pill.draft')) === 1
  && /Nothing is taken down\s+for\s+an edit/.test(split));
await page.click('#listing-delete');
const arch = await page.textContent('#arch-scrim');
ok('delete with bookings is REFUSED (gap #18)', await page.isVisible('#arch-scrim')
  && arch.includes('cannot be deleted'));
ok('the archive path says what survives',
  arch.includes('Archive it') && arch.includes('2 upcoming bookings stand')
  && arch.includes('reviews and payouts keep pointing at a listing that still exists'));
await shot(page, '14-archive.png');
await page.click('#arch-cancel');
ok('archive modal dismisses', !(await page.isVisible('#arch-scrim')));

/* ══════════════ 14. pricing drawer + submit ══════════════ */
console.log('\n== 14. pricing drawer + submit for review ==');
await go('catalog');
await page.click('#listings .listing:nth-child(2) [data-edit]');
await page.click('#open-pricing');
ok('pricing drawer opens', (await cnt('#drawer.on')) === 1);
ok('pricing is tune-later', /required to go live/i.test(await page.textContent('#drawer')));
await page.click('#pf-sur-seg [data-sur="flat"]');
await page.fill('#pf-flat', '12.00');
await page.click('#drawer-save');
ok('pricing saves and says what it kept', (await page.textContent('#pf-saved')).includes('flat $12.00'));
await page.click('#drawer-close');
await page.click('#btn-submit-review');
ok('submitted state', (await page.textContent('#btn-submit-review')) === 'Submitted'
  && await page.isVisible('#submitted-state'));
ok('the frozen checklist says so', (await page.textContent('#checklist')).includes('In review — the list is frozen'));
await shot(page, '15-submitted.png');

/* ══════════════ 15. mock notes drawer ══════════════ */
console.log('\n== 15. mock notes ==');
await page.click('#notes-open');
ok('notes drawer opens', (await cnt('#notes.on')) === 1);
const notesTxt = await page.textContent('#notes');
ok('how-to-review note', notesTxt.includes('How to review this') || notesTxt.includes('provider console as it would actually be'));
ok('callout-dot legend lives here', notesTxt.includes('Callout legend') && notesTxt.includes('Delivery-method-first'));
ok('legend has ⑲', notesTxt.includes('⑲'));
ok('fix pack moved into the drawer, off the nav', (await cnt('#notes-fix #fix-block .fix')) === 6);
ok('two-mounts diagram in the drawer', (await cnt('#notes-mounts #map-mounts')) === 1);
ok('mounts diagram records the ruling', notesTxt.includes('into the create flow as step'));
ok('no Fix pack tab in the nav', !(await page.$$eval('.sidenav .ni', e => e.map(x => x.textContent))).some(t => /fix pack/i.test(t)));
await shot(page, '16-notes.png');
await page.click('#fix-a5-range');
await page.click('#fix-a4-new');
ok('delete confirm modal above the drawer', await page.isVisible('#modal-scrim'));
await page.click('#modal-cancel');
await page.click('#fix-a4-booked');
ok('the with-bookings variant is reachable from the fix pack', await page.isVisible('#arch-scrim'));
await page.click('#arch-cancel');
await page.click('#fix-a3-link');
ok('A3 link closes the notes and lands on step 4',
  (await view()) === 'view-create' && (await cnt('#notes.on')) === 0
  && (await page.textContent('#step-title')).startsWith('Logistics'));
await page.click('#notes-open');
await page.click('#notes-close');
ok('notes drawer closes', (await cnt('#notes.on')) === 0);

/* ══════════════ 16. honesty scan ══════════════ */
console.log('\n== 16. honesty ==');
let all = '';
for (const n of ['catalog','workstation','calendar','distribute','dashboard']) { await go(n); all += await page.evaluate(() => document.body.innerText); }
await openFlow();
all += await page.evaluate(() => document.body.innerText);
await page.click('#notes-open');
all += await page.evaluate(() => document.body.innerText);
await page.click('#notes-close');
ok('no “48 hours”', !/48\s*hours/i.test(all));
ok('review timing phrased as an expectation', /usually within 2 business days/i.test(all));
ok('never “Publish” for the submit action',
  !(await page.evaluate(() => Array.from(document.querySelectorAll('button')).map(b => b.textContent.trim())))
    .some(t => /publish service|publish listing/i.test(t)));
ok('maps labelled illustrative', all.includes('Map preview — illustrative'));
const html = fs.readFileSync(PATH, 'utf8');
const urls = (html.match(/https?:\/\/[^"'\s)]+/g) || []).filter(u => !/w3\.org|example\.com/.test(u));
ok('no external URLs (example.com only, for the meeting link)', urls.length === 0, urls.slice(0, 5).join(' | '));
ok('every map surface carries ODbL attribution',
  (await page.evaluate(() => document.querySelectorAll('.mapattr').length)) >= 4
  && (await page.evaluate(() => Array.from(document.querySelectorAll('.mapattr')).every(a => /OpenStreetMap contributors/.test(a.textContent)))));
ok('no invented distance or duration between stops', !/\d+\s*(km|min)[^"]{0,24}between (the )?stops/i.test(all));

/* ══════════════ 17. viewport overflow ══════════════ */
console.log('\n== 17. overflow ==');
let worst = 0;
for (const w of [1440, 1280, 1024]) {
  await page.setViewportSize({ width: w, height: 900 });
  for (const n of ['catalog','workstation','calendar','distribute','dashboard']) {
    await go(n); worst = Math.max(worst, await overflow());
  }
  await go('catalog');
  await page.click('#cat-mode-seg [data-mode="map"]'); worst = Math.max(worst, await overflow());
  await page.click('#cat-mode-seg [data-mode="list"]');
  await openFlow();
  await page.click('#steplist-ol li:nth-child(4)'); worst = Math.max(worst, await overflow());
  await go('workstation'); await page.click('#tile-property'); worst = Math.max(worst, await overflow());
  await page.click('#notes-open'); worst = Math.max(worst, await overflow());
  await page.click('#notes-close');
}
ok('zero horizontal body overflow at 1440 / 1280 / 1024', worst === 0, worst + 'px');
ok('zero console / page errors', errs.length === 0, errs.slice(0, 4).join(' || '));

await browser.close();
console.log(`\n${count - fails.length}/${count} checks passed` + (fails.length ? '\nFAILED:\n - ' + fails.join('\n - ') : ''));
process.exit(fails.length ? 1 : 0);
