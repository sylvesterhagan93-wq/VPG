// Builds a link from a property's address straight to Zillow - Zillow
// discontinued its public listing/API access years ago, so there's no
// official way to look up a Zestimate/listing by address with an API key.
// Instead this uses Zillow's own address-search URL pattern, which needs
// no key at all: https://www.zillow.com/homes/<address>_rb/ - Zillow
// resolves this straight to the property's page when the address is an
// exact match in their system, or to a search-results page otherwise
// (still useful even then - e.g. for a deal that's only got a city name
// on file so far, it lands on that city's listings).
function buildZillowUrl(address) {
  const trimmed = String(address || "").trim();
  if (!trimmed) return "https://www.zillow.com/";
  return `https://www.zillow.com/homes/${encodeURIComponent(trimmed)}_rb/`;
}

module.exports = { buildZillowUrl };
