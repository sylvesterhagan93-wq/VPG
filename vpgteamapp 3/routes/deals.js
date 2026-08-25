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

const router = express.Router();

// A deal's "month" is simply the calendar month it was added to the board
// (created_at) - this is what lets the board default to "this month only"
// and automatically roll over to next month, without anyone having to
// create a new monthly tab/sheet like the old Google Sheet required.
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

function dealFormDefaults() {
  return {
    address: "",
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
  };
}

router.get("/dealboard", async (req, res, next) => {
  try {
    const currentMonthKey = monthKey(new Date());
    const selectedMonthKey = /^\d{4}-\d{2}$/.test(req.query.month || "") ? req.query.month : currentMonthKey;

    const monthsResult = await db.query(
      `SELECT DISTINCT to_char(created_at, 'YYYY-MM') AS month_key FROM deals ORDER BY month_key DESC`
    );
    const months = monthsResult.rows.map((r) => r.month_key);
    if (!months.includes(currentMonthKey)) months.unshift(currentMonthKey);
    if (!months.includes(selectedMonthKey)) months.push(selectedMonthKey);
    months.sort().reverse();

    const dealsResult = await db.query(
      `SELECT deals.*, users.name AS created_by_name
       FROM deals
       LEFT JOIN users ON users.id = deals.created_by_user_id
       WHERE to_char(deals.created_at, 'YYYY-MM') = $1
       ORDER BY deals.created_at DESC`,
      [selectedMonthKey]
    );
    const deals = dealsResult.rows;

    const byStatus = { Active: [], UCB: [], Closed: [] };
    deals.forEach((d) => {
      if (byStatus[d.status]) byStatus[d.status].push(d);
    });

    const sum = (list) => list.reduce((total, d) => total + (Number(d.estimated_profit) || 0), 0);
    const summary = {
      active: { count: byStatus.Active.length, profit: sum(byStatus.Active) },
      ucb: { count: byStatus.UCB.length, profit: sum(byStatus.UCB) },
      closed: { count: byStatus.Closed.length, profit: sum(byStatus.Closed) },
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
      error: "Please enter a property address.",
    });
  }

  try {
    const status = STATUSES.includes(body.status) ? body.status : "Active";
    await db.query(
      `INSERT INTO deals
        (address, property_type, exit_strategy, marketing_channel, buy_price, estimated_rehab,
         arv, sale_price, estimated_profit, status, emd_received, misc_deal_costs, notes,
         deal_folder_url, created_by_user_id, closed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
      [
        body.address.trim(),
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
      error: "Please enter a property address.",
    });
  }

  try {
    const status = STATUSES.includes(body.status) ? body.status : "Active";
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
         address = $1, property_type = $2, exit_strategy = $3, marketing_channel = $4,
         buy_price = $5, estimated_rehab = $6, arv = $7, sale_price = $8, estimated_profit = $9,
         status = $10, emd_received = $11, misc_deal_costs = $12, notes = $13,
         deal_folder_url = $14, updated_at = now(), closed_at = $15
       WHERE id = $16`,
      [
        body.address.trim(),
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
