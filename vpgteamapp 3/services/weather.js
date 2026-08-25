// Cleveland, OH weather for the dashboard - the team is spread out
// everywhere, but the business runs on Cleveland time, so the dashboard
// shows it regardless of where whoever's looking happens to be.
//
// Uses Open-Meteo (open-meteo.com) - free, no API key required.

const axios = require("axios");

const CLEVELAND_LAT = 41.4993;
const CLEVELAND_LON = -81.6944;

// Open-Meteo's "current weather" codes follow the WMO weather interpretation
// table - this maps the numeric code to a short human-readable description.
const WEATHER_CODES = {
  0: "Clear sky",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Depositing rime fog",
  51: "Light drizzle",
  53: "Drizzle",
  55: "Dense drizzle",
  56: "Light freezing drizzle",
  57: "Freezing drizzle",
  61: "Light rain",
  63: "Rain",
  65: "Heavy rain",
  66: "Light freezing rain",
  67: "Freezing rain",
  71: "Light snow",
  73: "Snow",
  75: "Heavy snow",
  77: "Snow grains",
  80: "Light rain showers",
  81: "Rain showers",
  82: "Violent rain showers",
  85: "Light snow showers",
  86: "Heavy snow showers",
  95: "Thunderstorm",
  96: "Thunderstorm with light hail",
  99: "Thunderstorm with heavy hail",
};

function describeWeatherCode(code) {
  return WEATHER_CODES[code] || "";
}

// Best-effort - a failure here should never break the dashboard. Returns
// null if the weather can't be fetched or the response doesn't look right.
async function getClevelandWeather() {
  const response = await axios.get("https://api.open-meteo.com/v1/forecast", {
    params: {
      latitude: CLEVELAND_LAT,
      longitude: CLEVELAND_LON,
      current: "temperature_2m,weather_code",
      temperature_unit: "fahrenheit",
      timezone: "America/New_York",
    },
    timeout: 5000,
  });

  const current = response.data && response.data.current;
  if (!current || typeof current.temperature_2m !== "number") return null;

  return {
    tempF: Math.round(current.temperature_2m),
    description: describeWeatherCode(current.weather_code),
  };
}

module.exports = { getClevelandWeather, describeWeatherCode };
