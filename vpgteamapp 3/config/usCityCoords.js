// Projected [x, y] coordinates (same Albers USA pixel space as
// config/usMapPaths.js's state paths) for every city that currently
// appears in a real VPG deal address, keyed "City|ST". This is a small,
// hand-maintained lookup - same pattern as config/merchItems.js and
// config/titleCompanies.js - because deal addresses are free text and
// there's no geocoding API configured in this app. If a new deal's city
// isn't in here, the Buyers Map just skips its star marker (the deal
// still counts toward that state's totals) rather than erroring - see
// routes/buyersMap.js's cityCoordFor() helper.
//
// To add a new city: look up its center lat/lon, then project it with
// d3-geo's geoAlbersUsa() using the EXACT scale/translate us-atlas uses
// to build states-albers-10m.json - .scale(1300).translate([487.5, 305])
// (see that package's README) - NOT d3-geo's plain default. An earlier
// version of this file used the plain default and every marker silently
// landed outside its own state (verified with a point-in-polygon check:
// even Columbus, OH's dead-center capital, landed north of Ohio's
// polygon). The one-off generation script (documented in the project doc)
// now has this scale/translate hardcoded - re-run it rather than
// hand-computing a new entry.
module.exports = {
  "Cleveland|OH": {
    "x": 738.3,
    "y": 222.8
  },
  "Tampa|FL": {
    "x": 769.5,
    "y": 530.9
  },
  "Toledo|OH": {
    "x": 707.1,
    "y": 223.7
  },
  "Akron|OH": {
    "x": 742.7,
    "y": 231.8
  },
  "Augusta|GA": {
    "x": 760,
    "y": 405.4
  },
  "Canton|OH": {
    "x": 746.1,
    "y": 237.9
  },
  "East Liverpool|OH": {
    "x": 760.2,
    "y": 239.5
  },
  "Gold Beach|OR": {
    "x": 32.1,
    "y": 150
  },
  "Show Low|AZ": {
    "x": 237.9,
    "y": 387.6
  },
  "Phoenix|AZ": {
    "x": 197.2,
    "y": 399.8
  },
  "Elizabeth City|NC": {
    "x": 853.2,
    "y": 323.1
  },
  "Apache Junction|AZ": {
    "x": 206.8,
    "y": 402.1
  },
  "Sun City|AZ": {
    "x": 194.2,
    "y": 395.7
  },
  "Tempe|AZ": {
    "x": 199.6,
    "y": 400.7
  },
  "Mesa|AZ": {
    "x": 201.6,
    "y": 401.3
  },
  "Glendale|AZ": {
    "x": 195.5,
    "y": 397.4
  },
  "Prescott Valley|AZ": {
    "x": 196.8,
    "y": 372.7
  },
  "Surprise|AZ": {
    "x": 192.5,
    "y": 394.8
  },
  "Casa Grande|AZ": {
    "x": 201,
    "y": 413.6
  },
  "Scottsdale|AZ": {
    "x": 200.2,
    "y": 399.2
  },
  "Chandler|AZ": {
    "x": 201,
    "y": 403.7
  },
  "Tucson|AZ": {
    "x": 213.2,
    "y": 430.8
  },
  "San Tan Valley|AZ": {
    "x": 206.1,
    "y": 407
  },
  "Globe|AZ": {
    "x": 220.9,
    "y": 404.9
  },
  "Sacramento|CA": {
    "x": 55.6,
    "y": 248
  },
  "North Highlands|CA": {
    "x": 58.1,
    "y": 246.2
  }
};
