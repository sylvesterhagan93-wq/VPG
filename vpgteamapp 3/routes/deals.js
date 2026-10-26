const express = require("express");
const db = require("../db/db");
const requireAdmin = require("../middleware/requireAdmin");
const {
  STATUSES,
  PROPERTY_TYPE_SUGGESTIONS,
  EXIT_STRATEGY_SUGGESTIONS,
  MARKETING_CHANNEL_SUGGESTIONS,
  MONTHLY_CLOSED_PROFIT_GOAL,
} = require("../config/dealBoard");
const { buildZillowUrl } = require("../services/zillow");
const { buildBarChart, buildHBarChart } = require("../services/charts");
const { STATE_NAMES } = require("../config/usLocations");

const router = express.Router();

// A deal's "month" used to be simply the calendar month it was added to the
// board (created_at). That matched the old Google Sheet's per-month tabs at
// first, but a deal from August (still open) would silently disappear once
// September rolled around even though it was still sitting right there on
// the Sheet's newest tab. Fixed 2026-09-08, then corrected TWICE more the
// same day - both corrections are worth understanding before touching this
// again, since the second one reverses part of the first:
// - Active/UCB deals carry forward from whenever they were created - this
//   part has been correct since the first fix and hasn't changed since.
// - Closed deals: the first correction (same day) made Closed carry forward
//   indefinitely too, from whenever a deal actually closed, reasoning that
//   the Sheet's September tab still listed 2112 23rd St NE as Closed even
//   though the DB's closed_at for it was back in August. That reasoning
//   was WRONG. Re-checked both the August and September tabs directly
//   (openpyxl, row-by-row) after Sylvester confirmed exactly which two
//   deals closed in September (1504 South Ave and 2112 23rd St NE): the
//   August tab lists 439 Walden Ave, 3236 Oak Rd, and 1832 Norwood Ave as
//   Closed (all closed 2026-08-25) and does NOT carry them onto the
//   September tab at all - they're archived off the sheet entirely once a
//   month passes. 2112 23rd St NE itself is UCB on the August tab, not yet
//   Closed - it only became Closed by the time the September tab was
//   made. So the Sheet's real behavior is: a deal is listed as "Closed" on
//   exactly the one tab/month it actually closed in, then drops off the
//   following month's tab - NOT indefinite carry-forward. The DB's
//   closed_at for deal 10 (2112 23rd St NE) had been set to 2026-08-28,
//   which was itself wrong per this same evidence - corrected to
//   2026-09-08 (when Sylvester confirmed this) since that's when it
//   actually shows as closed on the Sheet.
// - So: Closed deals are attributed strictly to the exact calendar month
//   they closed in (to_char(closed_at, 'YYYY-MM') = the selected month),
//   matching the Sheet exactly - carried forward only within that one
//   month like everything else, not beyond it.
// - `deals.estimated_profit IS NOT NULL` is kept as a guard regardless of
//   the above: the `deals` table also holds ~50+ historical "subject
//   property" rows backfilled purely to link cash buyers to their past
//   purchases for the Buyers Map feature (see the Buyers Map section of
//   this doc) - real closed transactions, but from 2021-2023, years before
//   this board existed, and never meant to be part of the Deal Board's
//   monthly view. Every one of the ~5-6 real board deals ever closed has a
//   real profit figure; every one of the ~50+ buyer-history rows has
//   `estimated_profit = NULL` - this is the clean, reliable signal that
//   separates the two categories, verified via a direct count before each
//   deploy of this filter. Worth re-testing this same way (`SELECT ...
//   WHERE <new filter>` against real Supabase data, comparing the result
//   to what the Sheet's own current tab actually lists) any time this
//   filter is touched again - both this bug and its first, over-corrected
//   fix were only caught by comparing against the live Sheet/DB directly,
//   never by `node --check` or a syntax-level render test.
// - "Dead" status added 2026-10-26 (a deal that fell through, matching
//   the Sheet's October tab) - attributed to a month the same way Closed
//   is: the exact month it actually went Dead, not carried forward. There's
//   no dedicated "dead_at" column, so `updated_at` (already bumped on every
//   status change) is the proxy - good enough since Dead is a terminal
//   status nobody edits further.
function monthKey(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key) {
  const [year, month] = key.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

// Parses a numeric-ish form field ("$140,000", "140000", "") into a number
// or null, so blank fields store as NULL instead of 0 or NaN.
function parseMoney(v) {
  if (v === undefined || v === null) return null;
  const trimmed = String(v).trim();
  if (!trimmed) return null;
  const cleaned = trimmed.replace(/[$,]/g, "");
  const num = Number(cleaned);
  return isNaN(num) ? null : num;
}

// A blank <input type="date"> submits as "" - store NULL rather than an
// invalid date.
function parseDateOrNull(v) {
  if (v === undefined || v === null) return null;
  const trimmed = String(v).trim();
  return trimmed || null;
}

function dealFormDefaults() {
  return {
    address: "",
    city: "",
    state: "",
    property_type: "",
    exit_strategy: "",
    marketing_channel: "",
    buy_price: "",
    estimated_rehab: "",
    arv: "",
    sale_price: "",
    estimated_profit: "",
    status: "Active",
    emd_received: false,
    misc_deal_costs: "",
    notes: "",
    deal_folder_url: "",
    expected_closing_date: "",
    inspection_period_end_date: "",
  };
}

router.get("/dealboard", async (req, res, next) => {
  try {
    const currentMonthKey = monthKey(new Date());
    const selectedMonthKey = /^\d{4}-\d{2}$/.test(req.query.month || "") ? req.query.month : currentMonthKey;

    const monthsResult = await db.query(
      `SELECT DISTINCT month_key FROM (
         SELECT to_char(created_at, 'YYYY-MM') AS month_key FROM deals
         UNION
         SELECT to_char(closed_at, 'YYYY-MM') AS month_key FROM deals WHERE closed_at IS NOT NULL
         UNION
         SELECT to_char(updated_at, 'YYYY-MM') AS month_key FROM deals WHERE status = 'Dead'
       ) months
       ORDER BY month_key DESC`
    );
    const months = monthsResult.rows.map((r) => r.month_key);
    if (!months.includes(currentMonthKey)) months.unshift(currentMonthKey);
    if (!months.includes(selectedMonthKey)) months.push(selectedMonthKey);
    months.sort().reverse();

    // See the monthKey() comment above - Active/UCB deals carry forward into
    // the selected month from whenever they were created; Closed and Dead
    // deals show only in the exact month they actually closed/died,
    // matching the Sheet (bounded to real board deals only - see the guard
    // comment above).
    const dealsResult = await db.query(
      `SELECT deals.*, users.name AS created_by_name
       FROM deals
       LEFT JOIN users ON users.id = deals.created_by_user_id
       WHERE
         (deals.status IN ('Active', 'UCB') AND to_char(deals.created_at, 'YYYY-MM') <= $1)
         OR (
           deals.status = 'Closed'
           AND deals.estimated_profit IS NOT NULL
           AND to_char(COALESCE(deals.closed_at, deals.created_at), 'YYYY-MM') = $1
         )
         OR (
           deals.status = 'Dead'
           AND to_char(COALESCE(deals.updated_at, deals.created_at), 'YYYY-MM') = $1
         )
       ORDER BY deals.created_at DESC`,
      [selectedMonthKey]
    );
    const deals = dealsResult.rows;

    const byStatus = { Active: [], UCB: [], Closed: [], Dead: [] };
    deals.forEach((d) => {
      if (byStatus[d.status]) byStatus[d.status].push(d);
    });

    const sum = (list) => list.reduce((total, d) => total + (Number(d.estimated_profit) || 0), 0);
    const summary = {
      active: { count: byStatus.Active.length, profit: sum(byStatus.Active) },
      ucb: { count: byStatus.UCB.length, profit: sum(byStatus.UCB) },
      closed: { count: byStatus.Closed.length, profit: sum(byStatus.Closed) },
      dead: { count: byStatus.Dead.length, profit: sum(byStatus.Dead) },
    };
    summary.potentialProfit = summary.active.profit + summary.ucb.profit;
    summary.goal = MONTHLY_CLOSED_PROFIT_GOAL;
    summary.goalPct = summary.goal > 0 ? Math.min(100, Math.round((summary.closed.profit / summary.goal) * 100)) : 0;

    // Average deal size and average close % - across ALL UCB/Closed deals
    // ever, not just the selected month, since a single month often has too
    // few completed deals for the average to mean much and these numbers
    // shouldn't jump around just from flipping the month dropdown.
    const performanceResult = await db.query(
      `SELECT estimated_profit, sale_price, arv FROM deals WHERE status IN ('UCB', 'Closed')`
    );
    const profitRows = performanceResult.rows.filter(
      (d) => d.estimated_profit !== null && d.estimated_profit !== undefined
    );
    summary.avgDealSize =
      profitRows.length > 0
        ? profitRows.reduce((total, d) => total + Number(d.estimated_profit), 0) / profitRows.length
        : null;
    summary.avgDealSizeCount = profitRows.length;

    const pctRows = performanceResult.rows.filter(
      (d) => d.sale_price !== null && d.arv !== null && Number(d.arv) !== 0
    );
    summary.avgClosePct =
      pctRows.length > 0
        ? pctRows.reduce((total, d) => total + (Number(d.sale_price) / Number(d.arv)) * 100, 0) / pctRows.length
        : null;
    summary.avgClosePctCount = pctRows.length;

    // Trend charts - monthly closed profit (last 12 calendar months,
    // zero-filled so a quiet month shows as a real gap rather than
    // disappearing) and a lifetime deals-by-exit-strategy breakdown.
    const monthlyProfitResult = await db.query(
      `SELECT to_char(closed_at, 'YYYY-MM') AS month_key, COALESCE(SUM(estimated_profit), 0) AS profit
       FROM deals
       WHERE status = 'Closed' AND closed_at >= (CURRENT_DATE - INTERVAL '11 months')
       GROUP BY month_key`
    );
    const monthlyProfitMap = new Map(monthlyProfitResult.rows.map((r) => [r.month_key, Number(r.profit)]));
    const trendItems = [];
    const today = new Date();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const value = monthlyProfitMap.get(key) || 0;
      trendItems.push({
        label: d.toLocaleDateString("en-US", { month: "short" }),
        value,
        valueLabel: "$" + Math.round(value).toLocaleString("en-US"),
      });
    }
    const profitTrendChart = buildBarChart(trendItems, { width: 640, height: 220 });

    const exitStrategyResult = await db.query(
      `SELECT COALESCE(NULLIF(TRIM(exit_strategy), ''), 'Unspecified') AS label, COUNT(*) AS count
       FROM deals
       GROUP BY 1
       ORDER BY count DESC`
    );
    const exitItems = exitStrategyResult.rows.map((r) => ({ label: r.label, value: Number(r.count) }));
    const exitStrategyChart = buildHBarChart(exitItems, { width: 640, rowHeight: 36 });

    res.render("dealboard", {
      userName: req.session.userName,
      isAdmin: req.session.isAdmin,
      byStatus,
      summary,
      statuses: STATUSES,
      months: months.map((m) => ({ key: m, label: monthLabel(m) })),
      selectedMonthKey,
      selectedMonthLabel: monthLabel(selectedMonthKey),
      isCurrentMonth: selectedMonthKey === currentMonthKey,
      error: req.session.dealBoardError || null,
      zillowUrl: buildZillowUrl,
      profitTrendChart,
      exitStrategyChart,
      hasClosedInWindow: trendItems.some((i) => i.value > 0),
      hasAnyDeals: exitItems.length > 0,
    });
    delete req.session.dealBoardError;
  } catch (err) {
    next(err);
  }
});

router.get("/dealboard/new", (req, res) => {
  res.render("deal-form", {
    userName: req.session.userName,
    mode: "new",
    deal: dealFormDefaults(),
    statuses: STATUSES,
    propertyTypeSuggestions: PROPERTY_TYPE_SUGGESTIONS,
    exitStrategySuggestions: EXIT_STRATEGY_SUGGESTIONS,
    marketingChannelSuggestions: MARKETING_CHANNEL_SUGGESTIONS,
    stateNames: STATE_NAMES,
    error: null,
  });
});

router.post("/dealboard/new", async (req, res, next) => {
  const body = req.body;

  if (!body.address || !body.address.trim()) {
    return res.render("deal-form", {
      userName: req.session.userName,
      mode: "new",
      deal: { ...dealFormDefaults(), ...body, emd_received: !!body.emd_received },
      statuses: STATUSES,
      propertyTypeSuggestions: PROPERTY_TYPE_SUGGESTIONS,
      exitStrategySuggestions: EXIT_STRATEGY_SUGGESTIONS,
      marketingChannelSuggestions: MARKETING_CHANNEL_SUGGESTIONS,
      stateNames: STATE_NAMES,
      error: "Please enter a property address.",
    });
  }

  try {
    const status = STATUSES.includes(body.status) ? body.status : "Active";
    const state = (body.state || "").trim().toUpperCase();
    const insertResult = await db.query(
      `INSERT INTO deals
        (address, city, state, property_type, exit_strategy, marketing_channel, buy_price, estimated_rehab,
         arv, sale_price, estimated_profit, status, emd_received, misc_deal_costs, notes,
         deal_folder_url, created_by_user_id, closed_at, expected_closing_date, inspection_period_end_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
       RETURNING id`,
      [
        body.address.trim(),
        (body.city || "").trim() || null,
        STATE_NAMES[state] ? state : null,
        (body.property_type || "").trim() || null,
        (body.exit_strategy || "").trim() || null,
        (body.marketing_channel || "").trim() || null,
        parseMoney(body.buy_price),
        parseMoney(body.estimated_rehab),
        parseMoney(body.arv),
        parseMoney(body.sale_price),
        parseMoney(body.estimated_profit),
        status,
        !!body.emd_received,
        parseMoney(body.misc_deal_costs),
        (body.notes || "").trim() || null,
        (body.deal_folder_url || "").trim() || null,
        req.session.userId,
        status === "Closed" ? new Date() : null,
        parseDateOrNull(body.expected_closing_date),
        parseDateOrNull(body.inspection_period_end_date),
      ]
    );
    res.redirect("/dealboard");
  } catch (err) {
    next(err);
  }
});

router.get("/dealboard/:id/edit", async (req, res, next) => {
  try {
    const result = await db.query("SELECT * FROM deals WHERE id = $1", [req.params.id]);
    const deal = result.rows[0];
    if (!deal) return res.status(404).send("Deal not found.");

    res.render("deal-form", {
      userName: req.session.userName,
      mode: "edit",
      deal,
      statuses: STATUSES,
      propertyTypeSuggestions: PROPERTY_TYPE_SUGGESTIONS,
      exitStrategySuggestions: EXIT_STRATEGY_SUGGESTIONS,
      marketingChannelSuggestions: MARKETING_CHANNEL_SUGGESTIONS,
      stateNames: STATE_NAMES,
      error: null,
    });
  } catch (err) {
    next(err);
  }
});

router.post("/dealboard/:id/edit", async (req, res, next) => {
  const body = req.body;

  if (!body.address || !body.address.trim()) {
    return res.render("deal-form", {
      userName: req.session.userName,
      mode: "edit",
      deal: { ...body, id: req.params.id, emd_received: !!body.emd_received },
      statuses: STATUSES,
      propertyTypeSuggestions: PROPERTY_TYPE_SUGGESTIONS,
      exitStrategySuggestions: EXIT_STRATEGY_SUGGESTIONS,
      marketingChannelSuggestions: MARKETING_CHANNEL_SUGGESTIONS,
      stateNames: STATE_NAMES,
      error: "Please enter a property address.",
    });
  }

  try {
    const status = STATUSES.includes(body.status) ? body.status : "Active";
    const state = (body.state || "").trim().toUpperCase();
    const existing = await db.query("SELECT status, closed_at FROM deals WHERE id = $1", [req.params.id]);
    if (existing.rows.length === 0) return res.status(404).send("Deal not found.");

    // Only stamp/clear closed_at when status is actually changing, so
    // editing other fields on an already-closed deal doesn't reset when it
    // was marked closed.
    let closedAt = existing.rows[0].closed_at;
    if (status === "Closed" && existing.rows[0].status !== "Closed") closedAt = new Date();
    if (status !== "Closed") closedAt = null;

    await db.query(
      `UPDATE deals SET
         address = $1, city = $2, state = $3, property_type = $4, exit_strategy = $5, marketing_channel = $6,
         buy_price = $7, estimated_rehab = $8, arv = $9, sale_price = $10, estimated_profit = $11,
         status = $12, emd_received = $13, misc_deal_costs = $14, notes = $15,
         deal_folder_url = $16, updated_at = now(), closed_at = $17, expected_closing_date = $18,
         inspection_period_end_date = $19
       WHERE id = $20`,
      [
        body.address.trim(),
        (body.city || "").trim() || null,
        STATE_NAMES[state] ? state : null,
        (body.property_type || "").trim() || null,
        (body.exit_strategy || "").trim() || null,
        (body.marketing_channel || "").trim() || null,
        parseMoney(body.buy_price),
        parseMoney(body.estimated_rehab),
        parseMoney(body.arv),
        parseMoney(body.sale_price),
        parseMoney(body.estimated_profit),
        status,
        !!body.emd_received,
        parseMoney(body.misc_deal_costs),
        (body.notes || "").trim() || null,
        (body.deal_folder_url || "").trim() || null,
        closedAt,
        parseDateOrNull(body.expected_closing_date),
        parseDateOrNull(body.inspection_period_end_date),
        req.params.id,
      ]
    );
    res.redirect("/dealboard");
  } catch (err) {
    next(err);
  }
});

// Quick status change from the board itself (the per-row dropdown) without
// opening the full edit form.
router.post("/dealboard/:id/status", async (req, res, next) => {
  const status = req.body.status;
  if (!STATUSES.includes(status)) {
    req.session.dealBoardError = "Not a valid status.";
    return res.redirect("/dealboard");
  }

  try {
    const existing = await db.query("SELECT status, closed_at FROM deals WHERE id = $1", [req.params.id]);
    if (existing.rows.length === 0) return res.status(404).send("Deal not found.");

    // Stamp closed_at the moment it first becomes Closed; clear it if moved
    // back off Closed; leave it alone if it's already Closed and re-saved.
    let closedAt = existing.rows[0].closed_at;
    if (status === "Closed" && existing.rows[0].status !== "Closed") closedAt = new Date();
    if (status !== "Closed") closedAt = null;

    await db.query("UPDATE deals SET status = $1, updated_at = now(), closed_at = $2 WHERE id = $3", [
      status,
      closedAt,
      req.params.id,
    ]);
    res.redirect(req.get("Referrer") || "/dealboard");
  } catch (err) {
    next(err);
  }
});

router.post("/dealboard/:id/delete", requireAdmin, async (req, res, next) => {
  try {
    await db.query("DELETE FROM deals WHERE id = $1", [req.params.id]);
    res.redirect(req.get("Referrer") || "/dealboard");
  } catch (err) {
    next(err);
  }
});

module.exports = router;
