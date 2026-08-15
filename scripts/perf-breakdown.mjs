import { chromium } from 'playwright';
const URL = 'https://traveloure.com/';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, deviceScaleFactor: 3 });
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
await cdp.send('Network.enable');
const reqs = new Map(); const done = [];
cdp.on('Network.responseReceived', e => reqs.set(e.requestId, { type: e.type, url: e.response.url, mime: e.response.mimeType }));
cdp.on('Network.loadingFinished', e => { const r = reqs.get(e.requestId); if (r) done.push({ ...r, kb: e.encodedDataLength/1024 }); });
await page.goto(URL, { waitUntil: 'load', timeout: 60000 });
await page.waitForTimeout(8000);
// loading attr audit of rendered imgs (above vs below fold)
const imgAudit = await page.evaluate(() => Array.from(document.images).map(i => ({
  src: (i.currentSrc || i.src).slice(0, 100), loading: i.loading || 'eager',
  aboveFold: i.getBoundingClientRect().top < 812, w: i.naturalWidth, dw: Math.round(i.getBoundingClientRect().width),
})));
const imgs = done.filter(d => d.type === 'Image').sort((a, b) => b.kb - a.kb);
const tot = t => done.filter(d => d.type === t).reduce((s, d) => s + d.kb, 0);
console.log('TOTAL KB:', Math.round(done.reduce((s,d)=>s+d.kb,0)), '| Script:', Math.round(tot('Script')), '| Image:', Math.round(tot('Image')), '| CSS:', Math.round(tot('Stylesheet')), '| Font:', Math.round(tot('Font')), '| Fetch:', Math.round(tot('Fetch')));
console.log('--- all image responses > 20KB (mime = actually served format) ---');
for (const i of imgs.filter(i => i.kb > 20)) console.log(Math.round(i.kb) + 'KB', i.mime, i.url.slice(0, 130));
console.log('--- <img> lazy/eager audit (rendered) ---');
for (const a of imgAudit) console.log(`${a.loading}${a.aboveFold ? ' ABOVE' : ' below'} dispW=${a.dw} natW=${a.w} ${a.src}`);
await b.close();
