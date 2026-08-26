const db = require("../db/db");

// A "buyer alert" is the Buyers Map's way of telling the team "one of our
// cash buyers targets this state, and we just got a deal there - reach
// out." Deliberately only fires once a deal is actually UCB or Closed
// (i.e. a real transaction, not just an Active/prospecting deal still
// being worked) and only when the deal has a state on file. Called after
// every deal insert/update/status-change in routes/deals.js - cheap to
// call unconditionally, since the checks above make it a no-op most of
// the time.
//
// One row per (deal, buyer) pair via the buyer_alerts table's UNIQUE
// constraint + ON CONFLICT DO NOTHING, so re-saving the same deal (e.g.
// editing an unrelated field) never creates duplicate alerts for a pairing
// that already fired.
async function checkBuyerAlertsForDeal(dealId) {
  const dealResult = await db.query(`SELECT id, state, status FROM deals WHERE id = $1`, [dealId]);
  const deal = dealResult.rows[0];
  if (!deal || !deal.state) return;
  if (!["UCB", "Closed"].includes(deal.status)) return;

  await db.query(
    `INSERT INTO buyer_alerts (deal_id, buyer_id, state)
     SELECT $1, buyers.id, $2
     FROM buyers
     WHERE buyers.deleted_at IS NULL
       AND $2 = ANY(buyers.target_states)
     ON CONFLICT (deal_id, buyer_id) DO NOTHING`,
    [dealId, deal.state]
  );
}

module.exports = { checkBuyerAlertsForDeal };
