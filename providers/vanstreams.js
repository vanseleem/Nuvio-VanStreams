'use strict';

const TMDB_KEY         = '83d364331c40bfbe29858aeed82f45cc';
const UA               = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const TORRENTCLAW_API  = 'https://torrentclaw.com/api/stremio';
const TORRENTIO_BASE   = 'https://torrentio.strem.fun';

const MAX_SIZE_GB_MOVIE  = 4;
const MAX_SIZE_GB_SERIES = 1.5;
const LINKS_PER_QUALITY  = 5;
const ALLOWED_QUALITIES  = ['4k', '1080p', '720p', '576p', '480p', 'webrip'];

const QUALITY_RANK = {
  '1080p': 1, '720p': 2, '576p': 3, '480p': 4,
  '4k': 5, '2160p': 5, 'webrip': 6, 'webdl': 6,
};

const PRIORITY_PROVIDERS = ['yts', 'knaben', 'torrentsdb', 'eztv', 'nyaasi', 'thepiratebay', 'torrentclaw'];

const KNOWN_PROVIDERS = [
  'YTS', 'EZTV', 'Knaben', 'Torrentio', 'Bitmagnet', 'Prowlarr',
  'DonTorrent', 'Torrents.csv', '1337x', 'TorrentGalaxy', 'RARBG',
  'ThePirateBay', 'BitSearch', 'LimeTorrents', 'Nyaa', 'KickassTorrents',
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
  const raw = (stream.title || '') + ' ' + (stream.name || '');
  const m   = raw.match(/💾\s*([\d.]+)\s*(GB|MB)/i) || raw.match(/([\d.]+)\s*(GB|MB)/i);
  if (!m) {
    if (typeof stream.size  === 'number' && stream.size  > 0) return stream.size  / 1073741824;
    if (typeof stream.bytes === 'number' && stream.bytes > 0) return stream.bytes / 1073741824;
    return null;
  }
  const val = parseFloat(m[1]);
  return m[2].toUpperCase() === 'GB' ? val : val / 1024;
}

function formatSize(sizeGB) {
  if (sizeGB === null || sizeGB === undefined || isNaN(sizeGB)) return 'Unknown Size';
  if (sizeGB < 1) return Math.round(sizeGB * 1024) + 'MB';
  return sizeGB.toFixed(1) + 'GB';
}

function getSeeders(stream) {
  if (stream._seeders != null) return stream._seeders;
  if (stream.behaviorHints && stream.behaviorHints.seeders) return stream.behaviorHints.seeders;
  const raw = (stream.title || '') + ' ' + (stream.name || '');
  const m = raw.match(/🌱\s*(\d+)/) || raw.match(/👤\s*(\d+)/);
  return m ? parseInt(m[1], 10) : 0;
}

function getLangLine(str = '') {
  const lower = str.toLowerCase();
  const found = [];
  const checks = [
    [/\benglish\b/,          'English'],
    [/\bjapanese\b/,         'Japanese'],
    [/\bhindi\b/,            'Hindi'],
    [/\bfrench\b/,           'French'],
    [/\bgerman\b/,           'German'],
    [/\bspanish\b/,          'Spanish'],
    [/\bitalian\b/,          'Italian'],
    [/\brussian\b/,          'Russian'],
    [/\bkorean\b/,           'Korean'],
    [/\bchinese\b/,          'Chinese'],
    [/\barabic\b/,           'Arabic'],
    [/\bportuguese\b/,       'Portuguese'],
    [/\bturkish\b/,          'Turkish'],
    [/\bpolish\b/,           'Polish'],
    [/\bdutch\b/,            'Dutch'],
    [/\bczech\b/,            'Czech'],
    [/\bswedish\b/,          'Swedish'],
    [/\bnorwegian\b/,        'Norwegian'],
    [/\bdanish\b/,           'Danish'],
    [/\bfinnish\b/,          'Finnish'],
    [/\bromanian\b/,         'Romanian'],
    [/\bgreek\b/,            'Greek'],
    [/\bhebrew\b/,           'Hebrew'],
    [/\bthai\b/,             'Thai'],
    [/\bindonesian\b/,       'Indonesian'],
    [/\bvietnamese\b/,       'Vietnamese'],
    [/\btamil\b/,            'Tamil'],
    [/\btelugu\b/,           'Telugu'],
    [/\burdu\b/,             'Urdu'],
    [/\bdubbed\b/,           'Dubbed'],
    [/\bdual[\s\-]audio\b/,  'Dual Audio'],
    [/\bmulti[\s\-]audio\b/, 'Multi Audio'],
    [/\bmulti\b/,            'Multi'],
  ];
  for (const [re, label] of checks) {
    if (re.test(lower)) {
      if (label === 'Multi' && found.includes('Multi Audio')) continue;
      found.push(label);
    }
  }
  return [...new Set(found)].join(' / ');
}

function detectProvider(combined, item, idx) {
  const upper = combined.toUpperCase();
  if (item && item.provider) return String(item.provider);
  if (item && item.source)   return String(item.source);
  if (item && item.indexer)  return String(item.indexer);
  for (const provider of KNOWN_PROVIDERS) {
    if (upper.includes(provider.toUpperCase())) return provider;
  }
  return KNOWN_PROVIDERS[idx % KNOWN_PROVIDERS.length];
}

function qualityEmoji(quality) {
  switch (quality) {
    case '4k':
    case '2160p':  return '🔥';
    case '1080p':  return '🌟';
    case '720p':   return '💎';
    case '576p':
    case '480p':   return '📱';
    case 'webrip':
    case 'webdl':  return '🌐';
    default:       return '🔥';
  }
}

function buildUnifiedTitle({ isSeries, title, year, season, episode, quality, tagLine, seeders, sizeStr, provider }) {
  const header    = isSeries
    ? `📺 ${title} | S${season || 1} E${episode || 1}`
    : `🎬 ${title}${year ? ' - ' + year : ''}`;
  const qLine     = `${qualityEmoji(quality)} ${quality || 'unknown'}${tagLine ? ' | ' + tagLine : ''}`;
  const statsLine = `🌱 ${seeders} | 💾 ${sizeStr} | 🔗 ${provider}`;
  return `${header}\n${qLine}\n${statsLine}`;
}

function buildUnifiedName({ quality, seeders, sourceLabel }) {
  return `${sourceLabel} | ${(quality || 'unknown').toUpperCase()} | 🌱${seeders}`;
}

function processStreams(streams, type) {
  const maxSize = type === 'series' ? MAX_SIZE_GB_SERIES : MAX_SIZE_GB_MOVIE;

  const filtered = streams.filter(s => {
    if (!s.infoHash && !s.url) return false;
    const q = s._quality || getQuality(s.title || s.name || '');
    if (!q || !ALLOWED_QUALITIES.includes(q)) return false;
    const sizeGB = s._sizeGB != null ? s._sizeGB : getSizeGB(s);
    if (sizeGB !== null && sizeGB > maxSize) return false;
    return true;
  });

  const seen = new Set();
  const unique = filtered.filter(s => {
    const key = (s.infoHash || '').toLowerCase();
    if (!key) return true;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
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

  const sortedQualities = Object.keys(byQuality).sort(
    (a, b) => (QUALITY_RANK[a] || 99) - (QUALITY_RANK[b] || 99)
  );

  const result = [];
  sortedQualities.forEach(q => result.push(...byQuality[q].slice(0, LINKS_PER_QUALITY)));
  return result;
}

// ── TMDB ─────────────────────────────────────────────────────────────

async function tmdbLookup(tmdbId, type) {
  try {
    const isSeries = type === 'tv' || type === 'series';
    const r = await fetch(
      `https://api.themoviedb.org/3/${isSeries ? 'tv' : 'movie'}/${tmdbId}?api_key=${TMDB_KEY}&append_to_response=external_ids`,
      { headers: { 'User-Agent': UA } }
    );
    if (!r.ok) return null;
    const d = await r.json();
    const extIds = d.external_ids || {};
    return {
      imdbId: extIds.imdb_id || d.imdb_id || String(tmdbId),
      title:  d.title || d.name || '',
      year:   (d.release_date || d.first_air_date || '').slice(0, 4),
    };
  } catch (_) { return null; }
}

// ── 1. YTS ───────────────────────────────────────────────────────────

async function scrapeYTS(imdbId) {
  try {
    const r = await fetch(
      `https://movies-api.accel.li/api/v2/list_movies.json?query_term=${imdbId}&limit=10`,
      { headers: { 'User-Agent': UA } }
    );
    if (!r.ok) return [];
    const data = await r.json();
    if (data.status !== 'ok' || !data.data || !data.data.movies || !data.data.movies.length) return [];
    const streams = [];
    for (const movie of data.data.movies) {
      if (movie.imdb_code && movie.imdb_code !== imdbId) continue;
      for (const t of (movie.torrents || [])) {
        if (!t.hash) continue;
        const qualityStr = `${t.quality} ${t.type || ''}`.trim();
        const sizeGB     = t.size_bytes ? t.size_bytes / 1073741824 : null;
        const sizeStr    = formatSize(sizeGB);
        const quality    = getQuality(qualityStr);
        const upper      = qualityStr.toUpperCase();
        const tags       = [];
        if (upper.includes('HEVC') || upper.includes('X265') || upper.includes('H265')) tags.push('HEVC');
        const langLine = getLangLine(qualityStr);
        if (langLine) tags.push(langLine);
        else tags.push('English');
        const tagLine = tags.join(' • ');
        streams.push({
          infoHash:  t.hash.toLowerCase(),
          name:      buildUnifiedName({ quality, seeders: t.seeds || 0, sourceLabel: '🍿 YTS' }),
          title:     buildUnifiedTitle({ isSeries: false, title: movie.title, year: String(movie.year), season: '', episode: '', quality, tagLine, seeders: t.seeds || 0, sizeStr, provider: 'YTS' }),
          sources:   [],
          _quality:  quality,
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

// ── 2. TorrentClaw ───────────────────────────────────────────────────

async function scrapeTorrentClaw(type, imdbId, title, year, season, episode) {
  try {
    const isSeries = type === 'series' || type === 'tv';
    const path     = isSeries
      ? `series/${imdbId}:${season || 1}:${episode || 1}`
      : `movie/${imdbId}`;
    const url = `${TORRENTCLAW_API}/stream/${path}.json`;

    const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
    if (!r.ok) return [];
    const data = await r.json();
    if (!data || !Array.isArray(data.streams) || !data.streams.length) return [];

    const streams = [];
    data.streams.forEach((item, idx) => {
      if (!item) return;
      const rawName  = item.name  || '';
      const rawTitle = item.title || '';
      const rawDesc  = item.description || '';
      const combined = `${rawName} ${rawTitle} ${rawDesc}`.replace(/\n/g, ' ');
      const upper    = combined.toUpperCase();
      const infoHashMatch = (item.url || '').match(/btih:([a-fA-F0-9]{32,40})/i);
      const infoHash = item.infoHash || (infoHashMatch ? infoHashMatch[1] : null);
      if (!infoHash && !item.url) return;
      const sizeGB = getSizeGB({ title: combined, size: item.size, bytes: item.bytes });
      const sizeStr = formatSize(sizeGB);
      const seeders = typeof item.seeders === 'number'
        ? item.seeders
        : (() => { const m = combined.match(/🌱\s*(\d+)/) || combined.match(/👤\s*(\d+)/) || combined.match(/(\d+)\s*seed/i); return m ? parseInt(m[1], 10) : 0; })();
      const provider = detectProvider(combined, item, idx);
      const quality  = getQuality(combined) || getQuality(upper);
      const tags = [];
      if (upper.includes('DV') || upper.includes('DOLBY VISION')) tags.push('DV');
      if (upper.includes('HDR10+'))      tags.push('HDR10+');
      else if (upper.includes('HDR10'))  tags.push('HDR10');
      else if (upper.includes('HDR'))    tags.push('HDR');
      if (upper.includes('HEVC') || upper.includes('X265') || upper.includes('H265')) tags.push('HEVC');
      const langLine = getLangLine(combined);
      if (langLine) tags.push(langLine);
      else tags.push('English');
      const tagLine = tags.join(' • ');
      streams.push({
        infoHash:  infoHash ? infoHash.toLowerCase() : undefined,
        url:       infoHash ? undefined : item.url,
        name:      buildUnifiedName({ quality, seeders, sourceLabel: '🦞 TorrentClaw' }),
        title:     buildUnifiedTitle({ isSeries, title, year, season, episode, quality, tagLine, seeders, sizeStr, provider }),
        sources:   [],
        _quality:  quality,
        _seeders:  seeders,
        _sizeGB:   sizeGB,
        _source:   'torrentclaw',
        _provider: provider.toLowerCase(),
      });
    });
    return streams;
  } catch (_) { return []; }
}

// ── 3. Torrentio ─────────────────────────────────────────────────────

async function fetchTorrentio(type, id, title, year, season, episode) {
  try {
    const url = `${TORRENTIO_BASE}/stream/${type}/${id}.json`;
    const r = await fetch(url, { headers: { 'User-Agent': UA } });
    if (!r.ok) return [];
    const data = await r.json();

    return (data.streams || []).map(s => {
      const origTitle = s.title || '';
      const providerMatch = origTitle.match(/⚙️\s*(\S+)/);
      let provider = providerMatch ? providerMatch[1] : 'Unknown';
      provider = provider.toLowerCase().replace(/\.(to|com|org|net|io)$/, '');
      if (provider === 'thepiratebay') provider = 'thepiratesbay';
      if (provider === 'nyaa.si')      provider = 'nyaa';
      if (provider === 'limetorrents') provider = 'limetorrent';
      if (provider === 'kat')          provider = 'kickasstorrents';
      const seeders = (s.behaviorHints && s.behaviorHints.seeders != null)
        ? s.behaviorHints.seeders
        : (() => { const m = origTitle.match(/👤\s*(\d+)/) || origTitle.match(/🌱\s*(\d+)/); return m ? parseInt(m[1], 10) : 0; })();
      const sizeGB  = getSizeGB(s);
      const sizeStr = formatSize(sizeGB);
      const quality = getQuality(origTitle) || getQuality(s.name || '');
      const upper   = origTitle.toUpperCase();
      const tags    = [];
      if (upper.includes('DV') || upper.includes('DOLBY VISION')) tags.push('DV');
      if (upper.includes('HDR10+'))      tags.push('HDR10+');
      else if (upper.includes('HDR10'))  tags.push('HDR10');
      else if (upper.includes('HDR'))    tags.push('HDR');
      if (upper.includes('HEVC') || upper.includes('X265') || upper.includes('H265')) tags.push('HEVC');
      const langLine = getLangLine(origTitle);
      if (langLine) tags.push(langLine);
      else tags.push('English');
      const tagLine = tags.join(' • ');
      return {
        ...s,
        name:      buildUnifiedName({ quality, seeders, sourceLabel: '🚀 Torrentio' }),
        title:     buildUnifiedTitle({ isSeries: type === 'series', title, year, season, episode, quality, tagLine, seeders, sizeStr, provider }),
        _quality:  quality,
        _seeders:  seeders,
        _sizeGB:   sizeGB,
        _source:   'torrentio',
        _provider: provider,
      };
    });
  } catch (_) { return []; }
}

// ── Main ──────────────────────────────────────────────────────────────

async function getStreams(tmdbId, type = 'movie', season = null, episode = null, settings = null) {
  try {
    const isSeries = type === 'tv' || type === 'series';
    const meta     = await tmdbLookup(tmdbId, type);
    const imdbId   = (meta && meta.imdbId) ? meta.imdbId : String(tmdbId);
    const title    = (meta && meta.title)  ? meta.title  : '';
    const year     = (meta && meta.year)   ? meta.year   : '';
    const stremioId = isSeries && season && episode
      ? `${imdbId}:${season}:${episode}`
      : imdbId;

    const [ytsR, torrentclawR, torrentioR] = await Promise.allSettled([
      isSeries ? Promise.resolve([]) : scrapeYTS(imdbId),
      scrapeTorrentClaw(type, imdbId, title, year, season, episode),
      fetchTorrentio(type, stremioId, title, year, season, episode),
    ]);

    const yts         = ytsR.status         === 'fulfilled' ? (ytsR.value         || []) : [];
    const torrentclaw = torrentclawR.status === 'fulfilled' ? (torrentclawR.value || []) : [];
    const torrentio   = torrentioR.status   === 'fulfilled' ? (torrentioR.value   || []) : [];

    return processStreams([...yts, ...torrentclaw, ...torrentio], type)
      .map(s => ({
        name:  s.name,
        title: s.title,
        url:   s.url || (s.infoHash ? buildMagnet(s.infoHash, title) : ''),
      }));

  } catch (_) { return []; }
}

async function onSettings() {
  return [
    { type: 'header', label: '☀️ VanStreams+' },
    {
      type: 'select', key: 'quality', label: 'Preferred Quality',
      options: [
        { label: 'All',   value: 'all'   },
        { label: '4K',    value: '4k'    },
        { label: '1080p', value: '1080p' },
        { label: '720p',  value: '720p'  },
      ],
      default: 'all',
    },
    {
      type: 'select', key: 'sortBy', label: 'Sort By',
      options: [
        { label: 'Seeders', value: 'seeders' },
        { label: 'Quality', value: 'quality' },
        { label: 'Size',    value: 'size'    },
      ],
      default: 'seeders',
    },
  ];
}

module.exports = { getStreams, onSettings };
