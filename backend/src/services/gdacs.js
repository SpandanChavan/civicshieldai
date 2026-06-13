const axios = require('../utils/axiosClient');
const xml2js = require('xml2js');
const { fetchWithCache } = require('./cacheService');

const GDACS_RSS_URL = 'https://www.gdacs.org/xml/rss.xml';
const EONET_URL = 'https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=50';

// Normalize GDACS raw event type codes to standard CivicShield types
const GDACS_TYPE_MAP = {
  EQ: 'Earthquake', FL: 'Flood', TC: 'Cyclone',
  TS: 'Tsunami',   VO: 'Volcano', DR: 'Drought',
  WF: 'Wildfire',  LS: 'Landslide',
};

// Normalize NASA EONET category titles to standard CivicShield types
const EONET_TYPE_MAP = {
  'Wildfires':            'Wildfire',
  'Volcanoes':            'Volcano',
  'Earthquakes':          'Earthquake',
  'Floods':               'Flood',
  'Severe Storms':        'Cyclone',
  'Tropical Storms':      'Cyclone',
  'Landslides':           'Landslide',
  'Drought':              'Drought',
  'Sea and Lake Ice':     'Natural Event',
  'Snow':                 'Natural Event',
  'Dust and Haze':        'Natural Event',
  'Temperature Extremes': 'Natural Event',
};

/**
 * Fetch global disaster alerts from GDACS RSS feed.
 * Covers: floods, cyclones, tsunamis, earthquakes, droughts, volcanoes.
 * Caches for 10 minutes.
 */
async function fetchGdacsAlerts() {
  const cacheKey = 'gdacs:rss:global';
  return fetchWithCache(cacheKey, 600, async () => {
    const { data } = await axios.get(GDACS_RSS_URL, {
      timeout: 10000,
      headers: { 'User-Agent': 'CivicShield-AI/1.0 (disaster monitoring)' },
    });

    const parsed = await xml2js.parseStringPromise(data, { explicitArray: false });
    const items = parsed?.rss?.channel?.item;
    if (!items) return [];

    const itemArray = Array.isArray(items) ? items : [items];
    return itemArray.map((item) => {
      const severityMap = { 'orange': 'High', 'red': 'Critical', 'green': 'Low' };
      const alertLevel = item['gdacs:alertlevel']?.toLowerCase() || 'green';

      return {
        source: 'GDACS',
        event_type: GDACS_TYPE_MAP[item['gdacs:eventtype']] || item['gdacs:eventtype'] || 'Unknown',
        title: item.title || 'GDACS Alert',
        description: item.description || '',
        severity: severityMap[alertLevel] || 'Medium',
        location: {
          lat: parseFloat(item['geo:lat'] || item['gdacs:latitude'] || 0),
          lon: parseFloat(item['geo:long'] || item['gdacs:longitude'] || 0),
        },
        raw_data: {
          link: item.link,
          pubDate: item.pubDate,
          eventId: item['gdacs:eventid'],
          country: item['gdacs:country'],
          alertScore: item['gdacs:alertscore'],
        },
        dedup_hash: `gdacs:${item['gdacs:eventid']}`,
      };
    }).filter(e => e.location.lat !== 0 || e.location.lon !== 0);
  });
}

/**
 * Fetch open natural events from NASA EONET (no key required).
 */
async function fetchEonetEvents() {
  const cacheKey = 'eonet:open:50';
  return fetchWithCache(cacheKey, 600, async () => {
    const { data } = await axios.get(EONET_URL, { timeout: 10000 });

    return (data.events || []).map((e) => {
      const geom = e.geometry?.[0];
      const coords = geom?.coordinates || [0, 0];

      const rawType = e.categories?.[0]?.title || 'Natural Event';
      return {
        source: 'NASA EONET',
        event_type: EONET_TYPE_MAP[rawType] || rawType,
        title: e.title,
        description: `Source: ${e.sources?.[0]?.url || 'N/A'}`,
        severity: 'Medium',
        location: { lat: coords[1], lon: coords[0] },
        raw_data: { id: e.id, link: e.link, date: geom?.date },
        dedup_hash: `eonet:${e.id}`,
      };
    }).filter(e => e.location.lat !== 0);
  });
}

module.exports = { fetchGdacsAlerts, fetchEonetEvents };
