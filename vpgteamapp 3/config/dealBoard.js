// Central config for the Deal Board - status list, the dropdown suggestion
// values pulled from your existing "VPG wholesale Deal Board" Google Sheet,
// and the monthly closed-profit goal shown as a progress bar. Edit here to
// change any of these without touching the routes or views.

// "Dead" added 2026-10-26 to match the Sheet's October tab (a deal that
// fell through, e.g. 147 N Marion St, Dayton) - distinct from Closed (a
// real completed sale). See routes/deals.js's monthKey() comment for how
// Dead deals are attributed to a month (same exact-month pattern as
// Closed, keyed off updated_at since there's no dedicated "dead_at"
// column).
const STATUSES = ["Active", "UCB", "Closed", "Dead"];

// Suggestions only (rendered as <datalist> options) - the fields stay free
// text so a new property type, exit strategy, or marketing channel doesn't
// require a code change to use.
const PROPERTY_TYPE_SUGGESTIONS = ["SFR", "Multifamily", "Land", "Commercial"];
const EXIT_STRATEGY_SUGGESTIONS = ["Wholesale", "Novation", "Flip", "Listing"];
const MARKETING_CHANNEL_SUGGESTIONS = ["Cold Calling", "JV", "Referral", "SMS", "PPC", "Direct Mail"];

// Matches the "$120,000 Monthly Goal" on the sheet's current (September)
// tab - was $50,000 on July/August's tabs; Sylvester raises this per month,
// so re-check the sheet's current tab before assuming this value still
// applies to a later month.
const MONTHLY_CLOSED_PROFIT_GOAL = 120000;

module.exports = {
  STATUSES,
  PROPERTY_TYPE_SUGGESTIONS,
  EXIT_STRATEGY_SUGGESTIONS,
  MARKETING_CHANNEL_SUGGESTIONS,
  MONTHLY_CLOSED_PROFIT_GOAL,
};
