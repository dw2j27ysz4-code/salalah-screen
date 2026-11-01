// Builds public/news.json from Arabic RSS feeds. RSS servers send no CORS headers,
// so the TV can't read them directly; GitHub Actions runs this on a schedule instead.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const FEEDS = [
  ['الرؤية', 'https://www.alroya.om/rss'],
  ['بي بي سي', 'https://feeds.bbci.co.uk/arabic/rss.xml'],
  ['سكاي نيوز', 'https://www.skynewsarabia.com/rss'],
  ['الجزيرة', 'https://www.aljazeera.net/aljazeerarss/a7c186be-1baa-4bd4-9d80-a84db769f779/73d0e1b4-532f-45ef-b135-bfdff8b8cab9'],
];
const PER_FEED = 8;
const OUT = fileURLToPath(new URL('../public/news.json', import.meta.url));

function cleanText(s) {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"').replace(/&(apos|#39);/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseTitles(xml) {
  return xml.split(/<item[\s>]|<entry[\s>]/).slice(1)
    .map((item) => { const m = item.match(/<title[^>]*>([\s\S]*?)<\/title>/); return m ? cleanText(m[1]) : ''; })
    .filter((t, i, all) => t && all.indexOf(t) === i);
}

async function feed([source, url]) {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 SalalahInfoScreen/1.0' }, signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const titles = parseTitles(await res.text()).slice(0, PER_FEED);
    console.log(`${source}: ${titles.length}`);
    return titles.map((title) => ({ source, title }));
  } catch (e) {
    console.warn(`${source} failed: ${e.message}`);
    return [];
  }
}

const lists = await Promise.all(FEEDS.map(feed));
const items = [];
for (let i = 0; i < PER_FEED; i++) lists.forEach((l) => { if (l[i]) items.push(l[i]); });
if (!items.length) {
  console.error('no headlines from any feed');
  process.exit(1);
}
writeFileSync(OUT, JSON.stringify({ updated: new Date().toISOString(), items }));
console.log(`wrote ${items.length} headlines`);
