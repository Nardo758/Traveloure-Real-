import { chromium } from 'playwright';
const URL = process.argv[2] || 'https://traveloure.com/';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 375, height: 812 }, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1', isMobile: true, deviceScaleFactor: 3 });
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
await cdp.send('Network.enable');
let transfer = 0; const byType = {}; const reqs = new Map(); const images = [];
cdp.on('Network.responseReceived', e => reqs.set(e.requestId, { type: e.type, url: e.response.url }));
cdp.on('Network.loadingFinished', e => {
  transfer += e.encodedDataLength;
  const r = reqs.get(e.requestId);
  const t = r?.type || 'Other';
  byType[t] = (byType[t] || 0) + e.encodedDataLength;
  if (t === 'Image' && e.encodedDataLength > 30000) images.push({ url: r.url.slice(0, 110), kb: Math.round(e.encodedDataLength/1024) });
});
await page.addInitScript(() => {
  window.__cls = 0; window.__lcp = 0;
  new PerformanceObserver(l => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: 'layout-shift', buffered: true });
  new PerformanceObserver(l => { const e = l.getEntries(); if (e.length) window.__lcp = e[e.length-1].startTime; }).observe({ type: 'largest-contentful-paint', buffered: true });
});
const t0 = Date.now();
await page.goto(URL, { waitUntil: 'load', timeout: 60000 });
await page.waitForTimeout(8000); // settle: lazy images, LCP finalize
// nudge scroll to finalize LCP then back
await page.evaluate(() => window.scrollBy(0, 1));
await page.waitForTimeout(1000);
const m = await page.evaluate(() => ({ lcp: Math.round(window.__lcp), cls: Number(window.__cls.toFixed(4)) }));
console.log('URL:', URL);
console.log('Total transfer:', (transfer/1024/1024).toFixed(2), 'MB (', Math.round(transfer/1024), 'KB )');
console.log('By type:', Object.fromEntries(Object.entries(byType).map(([k,v]) => [k, Math.round(v/1024)+'KB'])));
console.log('LCP:', m.lcp, 'ms  CLS:', m.cls);
console.log('Largest images:', JSON.stringify(images.sort((a,b)=>b.kb-a.kb).slice(0,6), null, 1));
await b.close();
