'use strict';

const TMDB_KEY       = '83d364331c40bfbe29858aeed82f45cc';
const UA             = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// ── Easy to change source URLs ──────────────────────────────────────
const TORRENTIO_URL  = 'https://torrentio.strem.fun';   // ← change this to torrentsdb or any other
const YTS_URL        = 'https://movies-api.accel.li';
const KNABEN_URL     = 'https://api.knaben.org/v1';
// ───────────────────────────────────────────────────────────────────

const PROXY_1 = 'https://corsproxy.io/?url=';
const PROXY_2 = 'https://api.codetabs.com/v1/proxy?quest=';
const PROXY_3 = 'https://thingproxy.freeboard.io/fetch/';

const MAX_SIZE_GB_MOVIE  = 4;
const MAX_SIZE_GB_SERIES = 1.5;
const LINKS_PER_QUALITY  = 5;
const ALLOWED_QUALITIES  = ['4k', '1080p', '720p', '576p', '480p', 'webrip'];

const QUALITY_RANK = {
  '1080p': 1, '720p': 2, '576p': 3, '480p': 4,
  '4k': 5, '2160p': 5, 'webrip': 6, 'webdl': 6,
};

const PRIORITY_PROVIDERS = ['yts', 'knaben', 'torrentsdb', 'eztv', 'nyaasi', 'thepiratebay'];

const ALLOWED_PROVIDERS = [
  'yts', 'knaben', 'thepiratesbay', 'thepiratebay', 'eztv', 'torrentcsv',
  'nyaa', 'nyaasi', 'limetorrent', 'kickasstorrents', 'animetosho', 'tokyotosho',
];

const TR = [
  'udp://tracker.opentrackr.org:1337/announce',
  'udp://open.stealth.si:80/announce',
  'udp://open.demonii.com:1337/announce',
  'udp://tracker.torrent.eu.org:451/announce',
  'udp://p4p.arenabg.com:1337/announce',
  'udp://exodus.desync.com:6969/announce',
  'udp://tracker.openbittorrent.com:6969/announce',
  'udp://tracker.dler.org:6969/announce',
  'https://tracker.moeblog.cn:443/announce',
  'https://tracker.zhuqiy.com:443/announce',
].map(t => '&tr=' + encodeURIComponent(t)).join('');

async function fetchWithProxy(url) {
  const proxies = [
    url,
    PROXY_1 + encodeURIComponent(url),
    PROXY_2 + encodeURIComponent(url),
    PROXY_3 + url,
  ];
  for (const p of proxies) {
    try {
      const r = await fetch(p, { headers: { 'User-Agent': UA } });
      if (r.ok) return r.json();
    } catch (_) {}
  }
  return null;
}

function buildMagnet(hash, name) {
  return 'magnet:?xt=urn:btih:' + hash.toLowerCase() + '&dn=' + encodeURIComponent(name) + TR;
}

function getQuality(str = '') {
  const s = str.toLowerCase();
  if (s.includes('4k') || s.includes('2160p') || s.includes('uhd')) return '4k';
  if (s.includes('1080p'))  return '1080p';
  if (s.includes('720p'))   return '720p';
  if (s.includes('576p'))   return '576p';
  if (s.includes('480p'))   return '480p';
  if (s.includes('webrip')) return 'webrip';
  if (s.includes('webdl') || s.includes('web-dl')) return 'webdl';
  return null;
}

function getSizeGB(stream) {
  const raw = stream.title || stream.name || '';
  const m = raw.match(/💾\s*([\d.]+)\s*(GB|MB)/i) || raw.match(/([\d.]+)\s*(GB|MB)/i);
  if (!m) return null;
  const val = parseFloat(m[1]);
  return m[2].toUpperCase() === 'GB' ? val : val / 1024;
}

function getSeeders(stream) {
  if (stream._seeders != null) return stream._seeders;
  if (stream.behaviorHints?.seeders) return stream.behaviorHints.seeders;
  const m = (stream.title || '').match(/👤\s*(\d+)/);
  return m ? parseInt(m[1], 10) : 0;
}

function getLangLine(str = '') {
  const lower = str.toLowerCase();
  const found = [];
  const checks = [
    [/\benglish\b/, 'English'], [/\bjapanese\b/, 'Japanese'], [/\bhindi\b/, 'Hindi'],
    [/\bfrench\b/, 'French'], [/\bgerman\b/, 'German'], [/\bspanish\b/, 'Spanish'],
    [/\bitalian\b/, 'Italian'], [/\brussian\b/, 'Russian'], [/\bkorean\b/, 'Korean'],
    [/\bchinese\b/, 'Chinese'], [/\barabic\b/, 'Arabic'], [/\bportuguese\b/, 'Portuguese'],
    [/\bturkish\b/, 'Turkish'], [/\bpolish\b/, 'Polish'], [/\bdutch\b/, 'Dutch'],
    [/\bczech\b/, 'Czech'], [/\bswedish\b/, 'Swedish'], [/\bnorwegian\b/, 'Norwegian'],
    [/\bdanish\b/, 'Danish'], [/\bfinnish\b/, 'Finnish'], [/\bromanian\b/, 'Romanian'],
    [/\bgreek\b/, 'Greek'], [/\bhebrew\b/, 'Hebrew'], [/\bthai\b/, 'Thai'],
    [/\bindonesian\b/, 'Indonesian'], [/\bvietnamese\b/, 'Vietnamese'],
    [/\btamil\b/, 'Tamil'], [/\btelugu\b/, 'Telugu'], [/\burdu\b/, 'Urdu'],
    [/\bdubbed\b/, 'Dubbed'], [/\bdual[\s\-]audio\b/, 'Dual Audio'],
    [/\bmulti[\s\-]audio\b/, 'Multi Audio'], [/\bmulti\b/, 'Multi'],
  ];
  for (const [re, label] of checks) {
    if (re.test(lower)) {
      if (label === 'Multi' && found.includes('Multi Audio')) continue;
      found.push(label);
    }
  }
  return [...new Set(found)].join(' / ');
}

function processStreams(streams, type) {
  const maxSize = type === 'series' ? MAX_SIZE_GB_SERIES : MAX_SIZE_GB_MOVIE;
  const filtered = streams.filter(s => {
    if (!s.infoHash && !s.url) return false;
    if (s._provider && !ALLOWED_PROVIDERS.includes(s._provider.toLowerCase())) return false;
    const q = s._quality || getQuality(s.title || s.name || '');
    if (!q || !ALLOWED_QUALITIES.includes(q)) return false;
    const sizeGB = s._sizeGB ?? getSizeGB(s);
    if (sizeGB !== null && sizeGB > maxSize) return false;
    return true;
  });
  const seen = new Set();
  const unique = filtered.filter(s => {
    const key = (s.infoHash || '').toLowerCase();
    if (!key) return true;
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
  const byQuality = {};
  unique.forEach(s => {
    const q = s._quality || getQuality(s.title || s.name || '') || 'unknown';
    if (!byQuality[q]) byQuality[q] = [];
    byQuality[q].push(s);
  });
  for (const q in byQuality) {
    byQuality[q].sort((a, b) => {
      const rankA = PRIORITY_PROVIDERS.indexOf((a._source || '').toLowerCase());
      const rankB = PRIORITY_PROVIDERS.indexOf((b._source || '').toLowerCase());
      const pA = rankA === -1 ? 999 : rankA;
      const pB = rankB === -1 ? 999 : rankB;
      if (pA !== pB) return pA - pB;
      return getSeeders(b) - getSeeders(a);
    });
  }
  const sortedQualities = Object.keys(byQuality).sort((a, b) => (QUALITY_RANK[a] || 99) - (QUALITY_RANK[b] || 99));
  const result = [];
  sortedQualities.forEach(q => result.push(...byQuality[q].slice(0, LINKS_PER_QUALITY)));
  return result;
}

async function tmdbLookup(tmdbId, type) {
  try {
    const isSeries = type === 'tv' || type === 'series';
    const url = `https://api.themoviedb.org/3/${isSeries ? 'tv' : 'movie'}/${tmdbId}?api_key=${TMDB_KEY}&append_to_response=external_ids`;
    const r = await fetch(url);
    if (!r.ok) return null;
    const d = await r.json();
    const imdbId = d.external_ids?.imdb_id || d.imdb_id || tmdbId;
    const title  = d.title || d.name || '';
    const year   = (d.release_date || d.first_air_date || '').slice(0, 4);
    return { imdbId, title, year };
  } catch (_) { return null; }
}

async function scrapeYTS(imdbId, title, year) {
  try {
    const url = `${YTS_URL}/api/v2/list_movies.json?query_term=${imdbId}&limit=10`;
    const r = await fetch(url, { headers: { 'User-Agent': UA } });
    if (!r.ok) return [];
    const data = await r.json();
    if (data.status !== 'ok' || !data.data?.movies?.length) return [];
    const streams = [];
    for (const movie of data.data.movies) {
      if (movie.imdb_code && movie.imdb_code !== imdbId) continue;
      for (const t of (movie.torrents || [])) {
        if (!t.hash) continue;
        const qualityStr = `${t.quality} ${t.type || ''}`.trim();
        const sizeGB = t.size_bytes ? t.size_bytes / 1073741824 : null;
        const sizeStr = sizeGB ? sizeGB.toFixed(2) + ' GB' : (t.size || '');
        const langLine = getLangLine(qualityStr);
        streams.push({
          infoHash:  t.hash.toLowerCase(),
          name:      qualityStr,
          title:     `☀️ ${title} (${year})\n🌱 ${t.seeds || 0}\n💾 ${sizeStr}\n🏅 YTS${langLine ? '\n🔊 ' + langLine : ''}`,
          url:       buildMagnet(t.hash, movie.title || title),
          _quality:  getQuality(qualityStr),
          _seeders:  t.seeds || 0,
          _sizeGB:   sizeGB,
          _source:   'yts',
          _provider: 'yts',
        });
      }
    }
    return streams;
  } catch (_) { return []; }
}

async function scrapeKnaben(title, year, isSeries, season, episode) {
  if (!title) return [];
  try {
    let query = title;
    if (year && !isSeries) query += ' ' + year;
    if (isSeries && season && episode)
      query += ` S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}`;
    const categories = isSeries ? [5000000, 5001000] : [2000000, 2001000];
    const r = await fetch(KNABEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'User-Agent': UA },
      body: JSON.stringify({ search_type: '75%', search_field: 'title', query, order_by: 'seeders', order_direction: 'desc', categories, from: 0, size: 40, hide_unsafe: true, hide_xxx: true }),
    });
    if (!r.ok) return [];
    const data = await r.json();
    if (!data?.hits?.length) return [];
    const streams = [];
    for (const hit of data.hits) {
      if (!hit.magnetUrl && !hit.hash) continue;
      const magnet = hit.magnetUrl || buildMagnet(hit.hash, hit.title || '');
      const hashMatch = magnet.match(/btih:([a-fA-F0-9]{32,40})/i);
      const hash = hashMatch ? hashMatch[1] : (hit.hash || '');
      if (!hash) continue;
      const sizeGB = hit.bytes ? hit.bytes / 1073741824 : null;
      const sizeStr = sizeGB ? sizeGB.toFixed(2) + ' GB' : '';
      const langLine = getLangLine(hit.title || '');
      streams.push({
        infoHash:  hash.toLowerCase(),
        name:      hit.title || '',
        title:     `☀️ ${title}${year ? ' (' + year + ')' : ''}\n🌱 ${hit.seeders || 0}\n💾 ${sizeStr}\n🏅 Knaben${langLine ? '\n🔊 ' + langLine : ''}`,
        url:       magnet,
        _quality:  getQuality(hit.title || ''),
        _seeders:  hit.seeders || 0,
        _sizeGB:   sizeGB,
        _source:   'knaben',
        _provider: 'knaben',
      });
    }
    return streams;
  } catch (_) { return []; }
}

async function scrapeTorrentio(type, imdbId, season, episode, title, year) {
  try {
    const isSeries = type === 'tv' || type === 'series';
    const path = isSeries
      ? `series/${imdbId}:${season || 1}:${episode || 1}`
      : `movie/${imdbId}`;
    const url = `${TORRENTIO_URL}/stream/${path}.json`;
    const data = await fetchWithProxy(url);
    if (!data?.streams?.length) return [];
    return data.streams.map(s => {
      const origTitle = s.title || '';
      const providerMatch = origTitle.match(/⚙️\s*(\S+)/);
      let provider = providerMatch ? providerMatch[1] : 'Unknown';
      provider = provider.toLowerCase().replace(/\.(to|com|org|net|io)$/, '');
      if (provider === 'thepiratebay') provider = 'thepiratesbay';
      if (provider === 'nyaa.si')      provider = 'nyaa';
      if (provider === 'limetorrents') provider = 'limetorrent';
      if (provider === 'kat')          provider = 'kickasstorrents';
      const seeders = s.behaviorHints?.seeders
        ?? (() => { const m = origTitle.match(/👤\s*(\d+)/); return m ? parseInt(m[1], 10) : 0; })();
      const sizeGB = getSizeGB(s);
      const langLine = getLangLine(origTitle);
      return {
        ...s,
        title:     `☀️ ${title}${year ? ' (' + year + ')' : ''}\n🌱 ${seeders}\n💾 ${sizeGB ? sizeGB.toFixed(2) + ' GB' : 'N/A'}\n🏅 ${provider}${langLine ? '\n🔊 ' + langLine : ''}`,
        url:       s.url || (s.infoHash ? buildMagnet(s.infoHash, title) : ''),
        _quality:  getQuality(origTitle || s.name || ''),
        _seeders:  seeders,
        _sizeGB:   sizeGB,
        _source:   'torrentio',
        _provider: provider,
      };
    });
  } catch (_) { return []; }
}

async function getStreams(tmdbId, type = 'movie', season = null, episode = null, settings = null) {
  try {
    const isSeries = type === 'tv' || type === 'series';
    const meta = await tmdbLookup(tmdbId, type);
    const imdbId = meta?.imdbId || String(tmdbId);
    const title  = meta?.title  || '';
    const year   = meta?.year   || '';

    const [ytsR, knabenR, torrentioR] = await Promise.allSettled([
      isSeries ? Promise.resolve([]) : scrapeYTS(imdbId, title, year),
      scrapeKnaben(title, year, isSeries, season, episode),
      scrapeTorrentio(type, imdbId, season, episode, title, year),
    ]);

    const yts       = ytsR.status       === 'fulfilled' ? (ytsR.value       || []) : [];
    const knaben    = knabenR.status    === 'fulfilled' ? (knabenR.value    || []) : [];
    const torrentio = torrentioR.status === 'fulfilled' ? (torrentioR.value || []) : [];

    return processStreams([...yts, ...knaben, ...torrentio], type);
  } catch (_) { return []; }
}

async function onSettings() {
  return [
    { type: 'header', label: 'VanStreams+' },
    {
      type: 'select', key: 'minQuality', label: 'Minimum Quality',
      options: [
        { label: 'Any',        value: 'any'   },
        { label: '720p+',      value: '720p'  },
        { label: '1080p+',     value: '1080p' },
        { label: '4K only',    value: '4k'    },
      ],
      default: 'any',
    },
    {
      type: 'select', key: 'sortBy', label: 'Sort By',
      options: [
        { label: 'Seeders',  value: 'seeders' },
        { label: 'Quality',  value: 'quality' },
        { label: 'Size',     value: 'size'    },
      ],
      default: 'seeders',
    },
  ];
}

module.exports = { getStreams, onSettings };
