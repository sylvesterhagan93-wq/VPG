const express = require("express");
const db = require("../db/db");
const requireAdmin = require("../middleware/requireAdmin");
const { STATE_NAMES } = require("../config/usLocations");
const MAP_PATHS = require("../config/usMapPaths");
const CITY_COORDS = require("../config/usCityCoords");

const router = express.Router();

// Looks up a projected [x,y] for a deal's city/state, or null if that city
// isn't in the hand-maintained config/usCityCoords.js lookup yet - see that
// file's header comment. A deal without a marker still counts toward its
// state's buyer-match list in the side panel, it just doesn't get a star
// pinned on the map itself.
function cityCoordFor(city, state) {
  if (!city || !state) return null;
  const key = `${city.trim()}|${state.trim().toUpperCase()}`;
  return CITY_COORDS[key] || null;
}

function buyerFormDefaults() {
  return { name: "", phone: "", email: "", target_states: [], target_cities: [], home_city_key: "", notes: "" };
}

// A buyer's home city is a single select (not a checkbox group like
// target_cities) validated the same way - only a "City|ST" key that
// actually has a map coordinate is accepted, so a bad/typo'd value can
// never produce a home_city/home_state pair with no star to show up on.
// Returns { city: null, state: null } for a blank/invalid selection.
function normalizeHomeCity(raw) {
  const key = raw ? String(raw).trim() : "";
  if (!key || !CITY_COORDS[key]) return { city: null, state: null };
  const [city, state] = key.split("|");
  return { city, state };
}

// Checkbox groups submit as a single string (one box checked), an array
// (multiple checked), or are simply absent from the body (none checked) -
// normalize all three to a clean array of valid, uppercase state codes.
function normalizeTargetStates(raw) {
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const seen = new Set();
  list.forEach((s) => {
    const code = String(s).trim().toUpperCase();
    if (STATE_NAMES[code]) seen.add(code);
  });
  return Array.from(seen);
}

// Same normalize-a-checkbox-group pattern as target_states, but validated
// against config/usCityCoords.js instead of STATE_NAMES - only lets through
// a "City|ST" key that actually has a map coordinate, so a target-city
// selection always produces a real, clickable star (never a silent typo).
function normalizeTargetCities(raw) {
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const seen = new Set();
  list.forEach((c) => {
    const key = String(c).trim();
    if (CITY_COORDS[key]) seen.add(key);
  });
  return Array.from(seen);
}

// Sorted "City|ST" -> "City, ST" options for the buyer form's target-city
// checkboxes, built from the same hand-maintained lookup the map stars use.
function cityOptionList() {
  return Object.keys(CITY_COORDS)
    .sort()
    .map((key) => {
      const [city, state] = key.split("|");
      return { key, label: `${city}, ${state}` };
    });
}

// The Buyers Map - an interactive US map (click a state to zoom in and see
// which buyers target it and which UCB/Closed deals we have there), plus a
// plain directory of every buyer underneath for anyone who'd rather just
// scan a list. "Deals" here deliberately means UCB or Closed only (a real
// assigned/sold transaction), not Active/prospecting deals still being
// worked.
// When a deal has a known buyer (deals.buyer_id), that buyer's exact
// purchase location - street, city, state, and ZIP, since that's all one
// address string on the deals table - shows on that deal's star marker and
// in the side panel, not just a state-level "this buyer targets Ohio."
router.get("/buyers-map", async (req, res, next) => {
  try {
    const [buyersResult, dealsResult] = await Promise.all([
      db.query(
        `SELECT * FROM buyers WHERE deleted_at IS NULL ORDER BY name ASC`
      ),
      db.query(
        `SELECT deals.id, deals.address, deals.city, deals.state, deals.status,
                deals.estimated_profit, deals.buyer_id, buyers.name AS buyer_name
         FROM deals
         LEFT JOIN buyers ON buyers.id = deals.buyer_id
         WHERE deals.state IS NOT NULL AND deals.status IN ('UCB', 'Closed')
         ORDER BY deals.created_at DESC`
      ),
    ]);
    const buyers = buyersResult.rows;
    const deals = dealsResult.rows;

    // Build per-state buckets only for states that actually have a buyer
    // targeting them or a deal in them, so the side panel and the map's
    // "has data" styling don't have to loop all 50 states client-side.
    const stateData = {};
    function bucket(abbr) {
      if (!stateData[abbr]) stateData[abbr] = { buyers: [], deals: [] };
      return stateData[abbr];
    }
    buyers.forEach((b) => {
      (b.target_states || []).forEach((abbr) => {
        bucket(abbr).buyers.push({ id: b.id, name: b.name, phone: b.phone, email: b.email });
      });
    });
    // Every UCB/Closed deal's full address (street, city, state, ZIP - it's
    // all one free-text column, see routes/deals.js) is exactly what a
    // buyer's purchase location is, once deals.buyer_id links the two - see
    // the "add_buyer_id_to_deals" migration. A deal without a known buyer
    // still shows up (buyerName just comes through null), so this doesn't
    // require every deal to have a buyer on file.
    const dealMarkers = [];
    deals.forEach((d) => {
      bucket(d.state).deals.push({
        id: d.id,
        address: d.address,
        city: d.city,
        status: d.status,
        buyerName: d.buyer_name || null,
      });
      const coord = cityCoordFor(d.city, d.state);
      if (coord) {
        dealMarkers.push({
          id: d.id,
          x: coord.x,
          y: coord.y,
          state: d.state,
          address: d.address,
          city: d.city,
          status: d.status,
          buyerName: d.buyer_name || null,
        });
      }
    });

    // Same buyer_id link, grouped by buyer instead of by state - feeds the
    // Buyer Directory table's "Purchased" column below the map, so a
    // buyer's exact purchase address shows up there too, not just on hover
    // on the map itself.
    const purchasesByBuyer = {};
    deals.forEach((d) => {
      if (!d.buyer_id) return;
      if (!purchasesByBuyer[d.buyer_id]) purchasesByBuyer[d.buyer_id] = [];
      purchasesByBuyer[d.buyer_id].push({ address: d.address, status: d.status });
    });

    // Vetted buyers who haven't purchased from us yet still get a marker at
    // any specific city they target (buyers.target_cities, a "City|ST" key
    // matching config/usCityCoords.js) - so clicking that city's star shows
    // them alongside (or instead of, if nothing's been purchased there yet)
    // any real UCB/Closed purchases. A buyer whose target city isn't in the
    // hand-maintained coordinate lookup is skipped here (same graceful-skip
    // pattern cityCoordFor() already uses for deals) rather than erroring.
    const cityProspects = {};
    buyers.forEach((b) => {
      (b.target_cities || []).forEach((cityKey) => {
        const coord = CITY_COORDS[cityKey];
        if (!coord) return;
        if (!cityProspects[cityKey]) {
          const [city, state] = cityKey.split("|");
          cityProspects[cityKey] = { x: coord.x, y: coord.y, city, state, buyers: [] };
        }
        cityProspects[cityKey].buyers.push({ id: b.id, name: b.name, phone: b.phone, email: b.email });
      });
    });

    // A buyer's HOME city (buyers.home_city/home_state - where they
    // physically are, matched from their phone's area code, see the
    // project doc) is a third, separate reason a star can carry a buyer:
    // distinct from an actual purchase (dealMarkers) and from a vetted
    // buyer specifically targeting that city to buy (cityProspects) - a
    // buyer can be based in Toledo, OH while only buying in Arizona, and
    // still needs to be findable by clicking Toledo's star. Every buyer
    // in this bucket is already vetted/a real buyer Sylvester has done
    // business with (see the project doc) - the panel/tooltip say "Based
    // Here," never "not yet purchased," since that phrase is specifically
    // about the cityProspects case above.
    const cityResidents = {};
    buyers.forEach((b) => {
      if (!b.home_city || !b.home_state) return;
      const coord = cityCoordFor(b.home_city, b.home_state);
      if (!coord) return;
      const key = `${b.home_city}|${b.home_state}`;
      if (!cityResidents[key]) {
        cityResidents[key] = { x: coord.x, y: coord.y, city: b.home_city, state: b.home_state, buyers: [] };
      }
      cityResidents[key].buyers.push({
        id: b.id,
        name: b.name,
        phone: b.phone,
        email: b.email,
        targetStates: b.target_states || [],
      });
    });

    // Serialized once here (not left to the view) so it's easy to guard
    // against a stray "</script>" inside free-text fields (buyer notes,
    // deal address) breaking out of the inline <script> tag it's embedded in.
    const clientData = JSON.stringify({ stateData, dealMarkers, cityProspects, cityResidents }).replace(/<\//g, "<\\/");

    res.render("buyers-map", {
      userName: req.session.userName,
      isAdmin: req.session.isAdmin,
      mapViewBox: MAP_PATHS.viewBox,
      mapStates: MAP_PATHS.states,
      stateNames: STATE_NAMES,
      statesWithData: Object.keys(stateData),
      clientDataJson: clientData,
      buyers,
      purchasesByBuyer,
      deletedBuyer: req.query.deletedBuyer
        ? (await db.query(`SELECT id, name FROM buyers WHERE id = $1 AND deleted_at IS NOT NULL`, [req.query.deletedBuyer])).rows[0] || null
        : null,
      error: null,
    });
  } catch (err) {
    next(err);
  }
});

router.get("/buyers/new", (req, res) => {
  res.render("buyer-form", {
    userName: req.session.userName,
    mode: "new",
    buyer: buyerFormDefaults(),
    stateNames: STATE_NAMES,
    cityOptions: cityOptionList(),
    error: null,
  });
});

router.post("/buyers", async (req, res, next) => {
  const body = req.body;
  const targetStates = normalizeTargetStates(body.target_states);
  const targetCities = normalizeTargetCities(body.target_cities);
  const homeCity = normalizeHomeCity(body.home_city);

  if (!body.name || !body.name.trim()) {
    return res.render("buyer-form", {
      userName: req.session.userName,
      mode: "new",
      buyer: { ...body, target_states: targetStates, target_cities: targetCities, home_city_key: body.home_city || "" },
      stateNames: STATE_NAMES,
      cityOptions: cityOptionList(),
      error: "Please enter a buyer name.",
    });
  }

  try {
    await db.query(
      `INSERT INTO buyers (name, phone, email, target_states, target_cities, home_city, home_state, notes, created_by_user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        body.name.trim(),
        (body.phone || "").trim() || null,
        (body.email || "").trim() || null,
        targetStates,
        targetCities,
        homeCity.city,
        homeCity.state,
        (body.notes || "").trim() || null,
        req.session.userId,
      ]
    );
    res.redirect("/buyers-map");
  } catch (err) {
    next(err);
  }
});

router.get("/buyers/:id/edit", async (req, res, next) => {
  try {
    const result = await db.query("SELECT * FROM buyers WHERE id = $1", [req.params.id]);
    const buyer = result.rows[0];
    if (!buyer) return res.status(404).send("Buyer not found.");
    buyer.home_city_key = buyer.home_city && buyer.home_state ? `${buyer.home_city}|${buyer.home_state}` : "";

    res.render("buyer-form", {
      userName: req.session.userName,
      mode: "edit",
      buyer,
      stateNames: STATE_NAMES,
      cityOptions: cityOptionList(),
      error: null,
    });
  } catch (err) {
    next(err);
  }
});

router.post("/buyers/:id/edit", async (req, res, next) => {
  const body = req.body;
  const targetStates = normalizeTargetStates(body.target_states);
  const targetCities = normalizeTargetCities(body.target_cities);
  const homeCity = normalizeHomeCity(body.home_city);

  if (!body.name || !body.name.trim()) {
    return res.render("buyer-form", {
      userName: req.session.userName,
      mode: "edit",
      buyer: { ...body, id: req.params.id, target_states: targetStates, target_cities: targetCities, home_city_key: body.home_city || "" },
      stateNames: STATE_NAMES,
      cityOptions: cityOptionList(),
      error: "Please enter a buyer name.",
    });
  }

  try {
    const result = await db.query(
      `UPDATE buyers SET name = $1, phone = $2, email = $3, target_states = $4, target_cities = $5,
              home_city = $6, home_state = $7, notes = $8
       WHERE id = $9`,
      [
        body.name.trim(),
        (body.phone || "").trim() || null,
        (body.email || "").trim() || null,
        targetStates,
        targetCities,
        homeCity.city,
        homeCity.state,
        (body.notes || "").trim() || null,
        req.params.id,
      ]
    );
    res.redirect("/buyers-map");
  } catch (err) {
    next(err);
  }
});

router.post("/buyers/:id/delete", requireAdmin, async (req, res, next) => {
  try {
    await db.query("UPDATE buyers SET deleted_at = now() WHERE id = $1", [req.params.id]);
    res.redirect(`/buyers-map?deletedBuyer=${req.params.id}`);
  } catch (err) {
    next(err);
  }
});

router.post("/buyers/:id/restore", requireAdmin, async (req, res, next) => {
  try {
    await db.query("UPDATE buyers SET deleted_at = NULL WHERE id = $1", [req.params.id]);
    res.redirect("/buyers-map");
  } catch (err) {
    next(err);
  }
});

module.exports = router;
