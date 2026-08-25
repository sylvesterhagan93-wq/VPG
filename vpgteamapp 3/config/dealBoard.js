// Central config for the Deal Board - status list, the dropdown suggestion
// values pulled from your existing "VPG wholesale Deal Board" Google Sheet,
// and the monthly closed-profit goal shown as a progress bar. Edit here to
// change any of these without touching the routes or views.

const STATUSES = ["Active", "UCB", "Closed"];

// Suggestions only (rendered as <datalist> options) - the fields stay free
// text so a new property type, exit strategy, or marketing channel doesn't
// require a code change to use.
const PROPERTY_TYPE_SUGGESTIONS = ["SFR", "Multifamily", "Land", "Commercial"];
const EXIT_STRATEGY_SUGGESTIONS = ["Wholesale", "Novation", "Flip", "Listing"];
const MARKETING_CHANNEL_SUGGESTIONS = ["Cold Calling", "JV", "Referral", "SMS", "PPC", "Direct Mail"];

// Matches the "$50,000 Monthly Goal" that was on every tab of the sheet.
const MONTHLY_CLOSED_PROFIT_GOAL = 50000;

module.exports = {
  STATUSES,
  PROPERTY_TYPE_SUGGESTIONS,
  EXIT_STRATEGY_SUGGESTIONS,
  MARKETING_CHANNEL_SUGGESTIONS,
  MONTHLY_CLOSED_PROFIT_GOAL,
};
