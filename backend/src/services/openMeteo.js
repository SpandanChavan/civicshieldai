const axios = require('../utils/axiosClient');
const { fetchWithCache } = require('./cacheService');

const OPEN_METEO_BASE = 'https://api.open-meteo.com/v1/forecast';

/**
 * Fetch weather forecast from Open-Meteo (100% free, no API key).
 * Returns temperature, precipitation, wind speed, weathercode.
 *
 * @param {number} lat - Latitude
 * @param {number} lon - Longitude
 * @param {number} days - Days of forecast (1-16)
 */
async function fetchWeatherForecast(lat, lon, days = 3) {
  const cacheKey = `openmeteo:${lat.toFixed(2)}:${lon.toFixed(2)}:${days}d`;

  return fetchWithCache(cacheKey, 1800, async () => {
    const { data } = await axios.get(OPEN_METEO_BASE, {
      params: {
        latitude: lat,
        longitude: lon,
        forecast_days: days,
        hourly: [
          'temperature_2m',
          'precipitation',
          'windspeed_10m',
          'weathercode',
          'relative_humidity_2m',
        ].join(','),
        daily: [
          'weathercode',
          'temperature_2m_max',
          'temperature_2m_min',
          'precipitation_sum',
          'windspeed_10m_max',
        ].join(','),
        timezone: 'Asia/Kolkata',
      },
      timeout: 10000,
    });

    return {
      location: { lat, lon },
      current: {
        temperature: data.hourly?.temperature_2m?.[0],
        precipitation: data.hourly?.precipitation?.[0],
        windspeed: data.hourly?.windspeed_10m?.[0],
        humidity: data.hourly?.relative_humidity_2m?.[0],
        weathercode: data.hourly?.weathercode?.[0],
      },
      daily: data.daily,
      hourly: data.hourly,
    };
  });
}

/**
 * Weather code → human-readable description mapping (WMO codes).
 */
const WEATHER_CODES = {
  0: 'Clear sky', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
  45: 'Fog', 48: 'Icy fog',
  51: 'Light drizzle', 53: 'Moderate drizzle', 55: 'Dense drizzle',
  61: 'Slight rain', 63: 'Moderate rain', 65: 'Heavy rain',
  71: 'Slight snow', 73: 'Moderate snow', 75: 'Heavy snow',
  77: 'Snow grains',
  80: 'Slight showers', 81: 'Moderate showers', 82: 'Violent showers',
  85: 'Slight snow showers', 86: 'Heavy snow showers',
  95: 'Thunderstorm', 96: 'Thunderstorm with slight hail', 99: 'Thunderstorm with heavy hail',
};

function describeWeather(code) {
  return WEATHER_CODES[code] || `Weather code ${code}`;
}

module.exports = { fetchWeatherForecast, describeWeather };
