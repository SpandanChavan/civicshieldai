const axios = require('../utils/axiosClient');
const xml2js = require('xml2js');
const crypto = require('crypto');
const { fetchWithCache } = require('./cacheService');

// SACHET CAP XML feed — NDMA's official national alert system
const SACHET_CAP_URL = 'https://sachet.ndma.gov.in/cap_public_website/FetchCapAlert';
const SACHET_RSS_URL = 'https://sachet.ndma.gov.in/cap_public_website/getAllPublicAlert';

// Map CAP severity to CivicShield severity
const SEVERITY_MAP = {
  'Extreme':  'Critical',
  'Severe':   'High',
  'Moderate': 'Medium',
  'Minor':    'Low',
  'Unknown':  'Medium',
};

// Map CAP event types to CivicShield event types
const EVENT_TYPE_MAP = {
  'Cyclone':            'Cyclone',
  'Cyclonic Storm':     'Cyclone',
  'Flood':              'Flood',
  'Earthquake':         'Earthquake',
  'Tsunami':            'Tsunami',
  'Landslide':          'Landslide',
  'Heat Wave':          'Heatwave',
  'Heat wave':          'Heatwave',
  'Heatwave':           'Heatwave',
  'Cold Wave':          'Cold Wave',
  'Cold wave':          'Cold Wave',
  'Heavy Rainfall':     'Flood',
  'Thunderstorm':       'Cyclone',
  'Strong Wind':        'Cyclone',
  'Forest Fire':        'Wildfire',
  'Wildfire':           'Wildfire',
  'Drought':            'Drought',
  'Lightning':          'Natural Event',
  'Fog':                'Natural Event',
};

/**
 * Fetch official NDMA alerts from SACHET CAP feed.
 * SACHET is India's national geo-targeted emergency alert system.
 * Returns alerts for all states/UTs with district-level granularity.
 */
async function fetchSachetAlerts() {
  const cacheKey = 'sachet:cap:india';
  return fetchWithCache(cacheKey, 300, async () => { // 5 min cache
    let alerts = [];

    // Try the main SACHET alert listing endpoint
    try {
      const { data } = await axios.get(SACHET_RSS_URL, {
        timeout: 15000,
        headers: {
          'User-Agent': 'CivicShield-AI/1.0 (India Disaster Management Platform)',
          'Accept': 'application/json, text/xml, */*',
        },
      });

      // SACHET may return JSON or XML depending on endpoint
      if (typeof data === 'object' && data.alerts) {
        alerts = parseSachetJson(data.alerts);
      } else if (typeof data === 'string') {
        alerts = await parseSachetXml(data);
      }
    } catch (err) {
      console.warn('[SACHET] Primary endpoint failed, trying fallback:', err.message);
    }

    // If primary fails, try the RSS fallback
    if (alerts.length === 0) {
      try {
        const { data } = await axios.get('https://sachet.ndma.gov.in/cap_public_website/getRssFeed', {
          timeout: 15000,
          headers: { 'User-Agent': 'CivicShield-AI/1.0' },
        });
        if (data) alerts = await parseSachetXml(data);
      } catch (err) {
        console.warn('[SACHET] RSS fallback also failed:', err.message);
      }
    }

    console.log(`[SACHET] Fetched ${alerts.length} India alerts`);
    return alerts;
  });
}

/** Parse SACHET JSON response */
function parseSachetJson(items) {
  if (!Array.isArray(items)) return [];
  return items.map((item) => {
    const rawType = item.event || item.eventType || 'Natural Event';
    const eventType = EVENT_TYPE_MAP[rawType] || rawType;
    const lat = parseFloat(item.latitude || item.lat || 20.5937);
    const lon = parseFloat(item.longitude || item.lon || 78.9629);

    return {
      source: 'SACHET-NDMA',
      event_type: eventType,
      title: item.headline || item.title || `${rawType} Alert`,
      description: item.description || item.instruction || `NDMA Alert: ${rawType}`,
      severity: SEVERITY_MAP[item.severity] || 'Medium',
      location: { lat, lon },
      affected_states: item.area || item.state || '',
      raw_data: {
        identifier: item.identifier,
        sender: item.sender || 'NDMA',
        sent: item.sent || item.published,
        expires: item.expires,
        area: item.area,
        web: item.web || 'https://sachet.ndma.gov.in',
      },
      dedup_hash: `sachet:${item.identifier || crypto.createHash('md5').update(`${rawType}${lat}${lon}${item.sent || Date.now()}`).digest('hex').slice(0, 12)}`,
      is_active: true,
    };
  }).filter(e => e.location.lat !== 0);
}

/** Parse SACHET CAP XML or RSS response */
async function parseSachetXml(xmlString) {
  try {
    const parsed = await xml2js.parseStringPromise(xmlString, { explicitArray: false });

    // Handle RSS format
    const rssItems = parsed?.rss?.channel?.item;
    if (rssItems) {
      const itemArray = Array.isArray(rssItems) ? rssItems : [rssItems];
      return itemArray.map((item) => {
        const rawType = item['cap:event'] || item.category || 'Natural Event';
        const eventType = EVENT_TYPE_MAP[rawType] || rawType;
        const lat = parseFloat(item['cap:circle']?.split(',')[0] || item['geo:lat'] || 20.5937);
        const lon = parseFloat(item['cap:circle']?.split(',')[1] || item['geo:long'] || 78.9629);

        return {
          source: 'SACHET-NDMA',
          event_type: eventType,
          title: item.title || `${rawType} Alert`,
          description: item.description || item['cap:description'] || '',
          severity: SEVERITY_MAP[item['cap:severity']] || 'Medium',
          location: { lat, lon },
          raw_data: {
            link: item.link,
            pubDate: item.pubDate,
            sender: 'NDMA India',
            web: 'https://sachet.ndma.gov.in',
          },
          dedup_hash: `sachet:${crypto.createHash('md5').update(item.guid || item.title || rawType + lat + lon).digest('hex').slice(0, 16)}`,
          is_active: true,
        };
      });
    }

    // Handle CAP 1.2 XML format
    const capAlerts = parsed?.feed?.entry;
    if (capAlerts) {
      const entryArray = Array.isArray(capAlerts) ? capAlerts : [capAlerts];
      return entryArray.map((entry) => {
        const info = entry.info || {};
        const area = info.area || {};
        const rawType = info.event || 'Natural Event';

        // Parse polygon/point from CAP area
        let lat = 20.5937, lon = 78.9629;
        if (area.circle) {
          const parts = area.circle.split(' ')[0].split(',');
          lat = parseFloat(parts[0]);
          lon = parseFloat(parts[1]);
        }

        return {
          source: 'SACHET-NDMA',
          event_type: EVENT_TYPE_MAP[rawType] || rawType,
          title: info.headline || entry.title || `${rawType} Alert`,
          description: info.description || info.instruction || '',
          severity: SEVERITY_MAP[info.severity] || 'Medium',
          location: { lat, lon },
          raw_data: {
            identifier: entry.id,
            sender: entry.author?.name || 'NDMA India',
            sent: entry.published,
            expires: info.expires,
            area: area.areaDesc,
            web: 'https://sachet.ndma.gov.in',
          },
          dedup_hash: `sachet:${crypto.createHash('md5').update(entry.id || rawType + lat).digest('hex').slice(0, 16)}`,
          is_active: true,
        };
      });
    }

    return [];
  } catch (err) {
    console.error('[SACHET] XML parse error:', err.message);
    return [];
  }
}

module.exports = { fetchSachetAlerts };
