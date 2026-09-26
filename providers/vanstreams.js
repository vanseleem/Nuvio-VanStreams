'use strict';

const TMDB_KEY      = '83d364331c40bfbe29858aeed82f45cc';
const UA            = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// ── Easy to change source URLs ──────────────────────────────────────
const TORRENTIO_URL   = 'https://torrentio.strem.fun';
const TORRENTCLAW_URL = 'https://torrentclaw.com/api/stremio';
const YTS_URL         = 'https://movies-api.accel.li';
const KNABEN_URL      = 'https://api.knaben.org/v1';
// ───────────────────────────────────────────────────────────────────

const PROXY_1 = 'https://corsproxy.io/?url=';
const PROXY_2 = 'https://api.codetabs.com/v1/proxy?quest=';
const PROXY_3 = 'https://thingproxy.freeboard.io/fetch/';

const MAX_SIZE_GB_MOVIE  = 4;
const MAX_SIZE_GB_SERIES = 1.5;
const LINKS_PER_QUALITY  = 5;

const QUALITY_RANK = {
  '4k': 5, '2160p': 5, '1080p': 3, '720p': 2, '576p': 1, '480p': 1, 'webrip': 2, 'webdl': 3,
};

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

// ── Helpers ──────────────────────────────────────────────────────────

function buildMagnet(hash, name) {
  return 'magnet:?xt=urn:btih:' + hash.toLowerCase() + '&dn=' + encodeURIComponent(name) + TR;
}

function getQuality(str = '') {
  const s = str.toLowerCase();
  if (s.includes('4k') || s.includes('2160p') || s.includes('uhd')) return '4k';
  if (s.includes('1080p') || s.includes('fhd')) return '1080p';
  if (s.includes('720p'))  return '720p';
  if (s.includes('576p'))  return '576p';
  if (s.includes('480p') || s.includes('sdtv')) return '480p';
  if (s.includes('webrip')) return 'webrip';
  if (s.includes('webdl') || s.includes('web-dl')) return 'webdl';
  return null;
}

function getQualityEmoji(q) {
  if (q === '4k')    return '🌟';
  if (q === '1080p') return '🔥';
  if (q === '720p')  return '💎';
  return '📱';
}

function getQualityRank(q) {
  return QUALITY_RANK[q] || 0;
}

function getSizeGB(raw, stream) {
  if (typeof stream?.size  === 'number' && stream.size  > 0) return stream.size  / 1073741824;
  if (typeof stream?.bytes === 'number' && stream.bytes > 0) return stream.bytes / 1073741824;
  const m = String(raw).match(/([0-9.]+)\s*([GM]B)/i);
  if (!m) return null;
  const val = parseFloat(m[1]);
  return m[2].toUpperCase() === 'GB' ? val : val / 1024;
}

function getSeeders(raw, stream) {
  if (typeof stream?.seeders === 'number') return Math.floor(stream.seeders);
  if (typeof stream?.seeds   === 'number') return Math.floor(stream.seeds);
  const m = raw.match(/🌱\s*(\d+)/) || raw.match(/👤\s*(\d+)/) || raw.match(/(\d+)\s*seed/i);
  return m ? parseInt(m[1], 10) : 0;
}

function getAudio(t) {
  if (t.includes('DUAL AUDIO') || t.includes('DUAL-AUDIO')) return 'Dual-Audio';
  if (t.includes('MULTI AUDIO') || t.includes('MULTI-AUDIO')) return 'Multi-Audio';
  if (t.includes('DUBBED')) return 'Dubbed';
  return 'Single-Audio';
}

function getCodec(t) {
  if (t.includes('X265') || t.includes('H265') || t.includes('HEVC')) return 'HEVC';
  if (t.includes('X264') || t.includes('H264') || t.includes('AVC'))  return 'AVC';
  if (t.includes('AV1')) return 'AV1';
  return null;
}

function getHDR(t) {
  const tags = [];
  if (t.includes('DV') || t.includes('DOLBY VISION')) tags.push('DV');
  if (t.includes('HDR10+'))     tags.push('HDR10+');
  else if (t.includes('HDR10')) tags.push('HDR10');
  else if (t.includes('HDR'))   tags.push('HDR');
  if (t.includes('ATMOS'))      tags.push('Atmos');
  return tags.join(' ');
}

function getInvertedSortTag(value, max = 999999) {
  const v = Math.max(0, parseInt(value, 10) || 0);
  return Math.max(0, max - v).toString(2).padStart(20, '0')
    .split('').map(c => c === '1' ? '\uFEFF' : '\u200B').join('');
}

async function fetchWithProxy(url) {
  const proxies = [
    url,
    PROXY_1 + encodeURIComponent(url),
    PROXY_2 + encodeURIComponent(url),
    PROXY_3 + url,
  ];
  for (const p of proxies) {
    try {
      const r = await fetch(p, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
      if (r.ok) return r.json();
    } catch (_) {}
  }
  return null;
}

// ── Card formatter — name + title at top level (Nuvio format) ────────

function buildCard(stream, rawText, title, isSeries, season, episode, year, settings = {}) {
  const combined = rawText.replace(/\n/g, ' ');
  const upper    = combined.toUpperCase();

  const quality      = getQuality(combined) || '1080p';
  const qualityEmoji = getQualityEmoji(quality);
  const qualityRank  = getQualityRank(quality);
  const seeders      = getSeeders(combined, stream);
  const sizeGB       = getSizeGB(combined, stream);
  const sizeStr      = sizeGB
    ? (sizeGB >= 1 ? sizeGB.toFixed(2) + ' GB' : Math.floor(sizeGB * 1024) + ' MB')
    : 'N/A';

  // Provider
  let provider = (stream._provider || 'Unknown');
  const provMatch = combined.match(/⚙️\s*(\S+)/);
  if (provMatch) {
    provider = provMatch[1].toLowerCase()
      .replace(/\.(to|com|org|net|io)$/, '');
  }
  const providerMap = {
    thepiratebay: 'TPB', thepiratesbay: 'TPB',
    'nyaa.si': 'Nyaa', nyaasi: 'Nyaa',
    limetorrents: 'LimeTorrents', kat: 'KAT',
    torrentclaw: 'TorrentClaw', yts: 'YTS',
    knaben: 'Knaben', torrentio: 'Torrentio',
  };
  provider = providerMap[provider.toLowerCase()] || (provider.charAt(0).toUpperCase() + provider.slice(1));

  const audio = getAudio(upper);
  const codec = getCodec(upper);
  const hdr   = getHDR(upper);

  // Filters
  if (settings.minQuality && settings.minQuality !== 'any') {
    if (qualityRank < getQualityRank(settings.minQuality)) return null;
  }
  const maxSize = isSeries ? MAX_SIZE_GB_SERIES : MAX_SIZE_GB_MOVIE;
  if (sizeGB && sizeGB > maxSize) return null;

  // Sort tag
  let sortVal = seeders;
  if (settings.sortBy === 'size')    sortVal = sizeGB ? Math.floor(sizeGB * 1024) : 0;
  if (settings.sortBy === 'quality') sortVal = qualityRank * 10000 + seeders;
  const sortTag = getInvertedSortTag(sortVal);

  // ── name: card header line (what Nuvio shows bold at top) ──
  const name = `${sortTag}☀️ VanStreams+ | ${quality.toUpperCase()} | 🌱${seeders}`;

  // ── title: detail lines below the header ──
  const mediaLine = isSeries
    ? `📺 ${title} | S${String(season).padStart(2,'0')} E${String(episode).padStart(2,'00')}`
    : `🎬 ${title} - ${year}`;

  const detailParts = [`${qualityEmoji} ${quality}`];
  if (codec) detailParts.push(codec);
  if (hdr)   detailParts.push(hdr);
  detailParts.push(audio);
  const detailLine = detailParts.join(' • ');

  const statsLine = `🌱 ${seeders} | 💾 ${sizeStr} | 🔗 ${provider}`;

  // Nuvio reads name + title directly on the stream object
  return {
    name,
    title:       `${mediaLine}\n${detailLine}\n${statsLine}`,
    url:         stream.url || (stream.infoHash ? buildMagnet(stream.infoHash, title) : ''),
    infoHash:    stream.infoHash || '',
    _seeders:    seeders,
    _sizeBytes:  sizeGB ? Math.floor(sizeGB * 1073741824) : 0,
    _qualityRank: qualityRank,
    _quality:    quality,
  };
}

// ── Sources ───────────────────────────────────────────────────────────

// 1. YTS
async function scrapeYTS(imdbId, title, year) {
  try {
    const r = await fetch(
      `${YTS_URL}/api/v2/list_movies.json?query_term=${imdbId}&limit=10`,
      { headers: { 'User-Agent': UA } }
    );
    if (!r.ok) return [];
    const data = await r.json();
    if (data.status !== 'ok' || !data.data?.movies?.length) return [];
    const out = [];
    for (const movie of data.data.movies) {
      if (movie.imdb_code && movie.imdb_code !== imdbId) continue;
      for (const t of (movie.torrents || [])) {
        if (!t.hash) continue;
        const sizeGB = t.size_bytes ? t.size_bytes / 1073741824 : null;
        out.push({
          infoHash:  t.hash.toLowerCase(),
          url:       buildMagnet(t.hash, movie.title || title),
          // raw info packed into name so buildCard can parse it
          name:      `${t.quality} ${t.type || ''} 1080p x264`.trim(),
          title:     `🌱 ${t.seeds || 0} 💾 ${sizeGB ? sizeGB.toFixed(2) + ' GB' : t.size || ''}`,
          _provider: 'yts',
          seeds:     t.seeds || 0,
          size:      t.size_bytes || 0,
        });
      }
    }
    return out;
  } catch (_) { return []; }
}

// 2. TorrentClaw
async function scrapeTorrentClaw(imdbId, type, season, episode) {
  try {
    const isSeries = type === 'tv' || type === 'series';
    const path = isSeries
      ? `series/${imdbId}:${season || 1}:${episode || 1}`
      : `movie/${imdbId}`;
    const data = await fetchWithProxy(`${TORRENTCLAW_URL}/stream/${path}.json`);
    if (!data?.streams?.length) return [];
    return data.streams.map(s => {
      const raw     = [s.name || '', s.title || '', s.description || ''].join(' ');
      const seeders = getSeeders(raw, s);
      const sizeGB  = getSizeGB(raw, s);
      let provider  = 'TorrentClaw';
      const known   = ['YTS','EZTV','Knaben','Torrentio','Bitmagnet','TPB','NyaaSi','LimeTorrents'];
      const upper   = raw.toUpperCase();
      for (const k of known) { if (upper.includes(k.toUpperCase())) { provider = k; break; } }
      return {
        url:       s.url || (s.infoHash ? buildMagnet(s.infoHash, '') : ''),
        infoHash:  s.infoHash || '',
        name:      raw,
        title:     raw,
        _provider: provider.toLowerCase(),
        seeds:     seeders,
        seeders:   seeders,
        size:      sizeGB ? Math.floor(sizeGB * 1073741824) : 0,
      };
    });
  } catch (_) { return []; }
}

// 3. Torrentio
async function scrapeTorrentio(type, imdbId, season, episode) {
  try {
    const isSeries = type === 'tv' || type === 'series';
    const path     = isSeries
      ? `series/${imdbId}:${season || 1}:${episode || 1}`
      : `movie/${imdbId}`;
    const data = await fetchWithProxy(`${TORRENTIO_URL}/stream/${path}.json`);
    if (!data?.streams?.length) return [];
    return data.streams.map(s => {
      const provMatch = (s.title || '').match(/⚙️\s*(\S+)/);
      let provider    = provMatch ? provMatch[1] : 'torrentio';
      provider = provider.toLowerCase().replace(/\.(to|com|org|net|io)$/, '');
      if (provider === 'thepiratebay') provider = 'tpb';
      if (provider === 'nyaa.si')      provider = 'nyaa';
      if (provider === 'limetorrents') provider = 'limetorrent';
      if (provider === 'kat')          provider = 'kickasstorrents';
      const seeders = s.behaviorHints?.seeders
        ?? (() => { const m = (s.title || '').match(/👤\s*(\d+)/); return m ? parseInt(m[1],10) : 0; })();
      const sizeGB = getSizeGB(s.title || '', s);
      return {
        ...s,
        name:      [s.name || '', s.title || ''].join(' '),
        title:     s.title || '',
        _provider: provider,
        seeds:     seeders,
        seeders:   seeders,
        size:      sizeGB ? Math.floor(sizeGB * 1073741824) : 0,
      };
    });
  } catch (_) { return []; }
}

// 4. Knaben
async function scrapeKnaben(title, year, isSeries, season, episode) {
  if (!title) return [];
  try {
    let query = title;
    if (year && !isSeries) query += ' ' + year;
    if (isSeries && season && episode)
      query += ` S${String(season).padStart(2,'0')}E${String(episode).padStart(2,'00')}`;
    const categories = isSeries ? [5000000, 5001000] : [2000000, 2001000];
    const r = await fetch(KNABEN_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': UA },
      body:    JSON.stringify({ search_type: '75%', search_field: 'title', query, order_by: 'seeders', order_direction: 'desc', categories, from: 0, size: 40, hide_unsafe: true, hide_xxx: true }),
    });
    if (!r.ok) return [];
    const data = await r.json();
    if (!data?.hits?.length) return [];
    return data.hits.filter(h => h.magnetUrl || h.hash).map(hit => {
      const magnet    = hit.magnetUrl || buildMagnet(hit.hash, hit.title || '');
      const hashMatch = magnet.match(/btih:([a-fA-F0-9]{32,40})/i);
      const hash      = hashMatch ? hashMatch[1] : (hit.hash || '');
      const sizeGB    = hit.bytes ? hit.bytes / 1073741824 : null;
      return {
        infoHash:  hash.toLowerCase(),
        url:       magnet,
        name:      hit.title || '',
        title:     `🌱 ${hit.seeders || 0} 💾 ${sizeGB ? sizeGB.toFixed(2)+' GB' : ''}`,
        _provider: 'knaben',
        seeds:     hit.seeders || 0,
        seeders:   hit.seeders || 0,
        bytes:     hit.bytes   || 0,
      };
    });
  } catch (_) { return []; }
}

// ── TMDB ──────────────────────────────────────────────────────────────

async function tmdbLookup(tmdbId, type) {
  try {
    const isSeries = type === 'tv' || type === 'series';
    const r = await fetch(
      `https://api.themoviedb.org/3/${isSeries ? 'tv' : 'movie'}/${tmdbId}?api_key=${TMDB_KEY}&append_to_response=external_ids`
    );
    if (!r.ok) return null;
    const d = await r.json();
    return {
      imdbId: d.external_ids?.imdb_id || d.imdb_id || String(tmdbId),
      title:  d.title || d.name || '',
      year:   (d.release_date || d.first_air_date || '').slice(0, 4),
    };
  } catch (_) { return null; }
}

// ── Main ──────────────────────────────────────────────────────────────

async function getStreams(tmdbId, type = 'movie', season = null, episode = null, settings = null) {
  try {
    const s        = settings || {};
    const isSeries = type === 'tv' || type === 'series';
    const meta     = await tmdbLookup(tmdbId, type);
    const imdbId   = meta?.imdbId || String(tmdbId);
    const title    = meta?.title  || '';
    const year     = meta?.year   || '';

    // Fetch all 4 in order: YTS → TorrentClaw → Torrentio → Knaben
    const [ytsR, clawR, torrentioR, knabenR] = await Promise.allSettled([
      isSeries ? Promise.resolve([]) : scrapeYTS(imdbId, title, year),
      scrapeTorrentClaw(imdbId, type, season, episode),
      scrapeTorrentio(type, imdbId, season, episode),
      scrapeKnaben(title, year, isSeries, season, episode),
    ]);

    const raw = [
      ...(ytsR.status       === 'fulfilled' ? ytsR.value       || [] : []),
      ...(clawR.status      === 'fulfilled' ? clawR.value      || [] : []),
      ...(torrentioR.status === 'fulfilled' ? torrentioR.value || [] : []),
      ...(knabenR.status    === 'fulfilled' ? knabenR.value    || [] : []),
    ];

    // Build cards
    const cards = [];
    for (const stream of raw) {
      const rawText = [stream.name || '', stream.title || ''].join(' ');
      const card    = buildCard(stream, rawText, title, isSeries, season || 1, episode || 1, year, s);
      if (card) cards.push(card);
    }

    // Deduplicate by infoHash
    const seen   = new Set();
    const unique = cards.filter(c => {
      const hash = (c.url.match(/btih:([a-f0-9]+)/i) || [])[1] || '';
      if (!hash) return true;
      if (seen.has(hash)) return false;
      seen.add(hash); return true;
    });

    // Sort
    unique.sort((a, b) => {
      if (s.sortBy === 'size')         return b._sizeBytes  - a._sizeBytes;
      if (s.sortBy === 'quality') {
        if (b._qualityRank !== a._qualityRank) return b._qualityRank - a._qualityRank;
        return b._seeders - a._seeders;
      }
      return b._seeders - a._seeders;
    });

    // Max 5 per quality group
    const byQ = {};
    unique.forEach(c => {
      const q = c._quality || 'unknown';
      if (!byQ[q]) byQ[q] = [];
      if (byQ[q].length < LINKS_PER_QUALITY) byQ[q].push(c);
    });

    // Return clean stream objects — name + title at top level
    return Object.values(byQ).flat().map(c => ({
      name:  c.name,
      title: c.title,
      url:   c.url,
    }));

  } catch (_) { return []; }
}

async function onSettings() {
  return [
    { type: 'header', label: 'VanStreams+' },
    {
      type: 'select', key: 'minQuality', label: 'Minimum Quality',
      options: [
        { label: 'Any',     value: 'any'   },
        { label: '720p+',   value: '720p'  },
        { label: '1080p+',  value: '1080p' },
        { label: '4K only', value: '4k'    },
      ],
      default: 'any',
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
