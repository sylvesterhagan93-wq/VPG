/**
 * Builds a single mailing-style property address string, e.g.
 * "123 Main St, Toledo, OH 43609", from the separate Street Address / City /
 * State / ZIP form fields (config/agreementTypes.js).
 *
 * Used everywhere a full address is needed - the generated agreement PDFs,
 * the HelloSign request title/subject/message, and the `property_address`
 * column stored on the agreement (so Recent Activity, the download
 * filename, etc. all show the complete address). City and ZIP are their own
 * required fields rather than something the sender has to remember to type
 * into one box, so a complete address always makes it onto every document.
 */
function formatPropertyAddress(fields) {
  if (!fields) return "";
  const streetCity = [fields.property_address, fields.property_city]
    .map((v) => (v ? String(v).trim() : ""))
    .filter(Boolean)
    .join(", ");
  const stateZip = [fields.property_state, fields.property_zip]
    .map((v) => (v ? String(v).trim() : ""))
    .filter(Boolean)
    .join(" ");
  return [streetCity, stateZip].filter(Boolean).join(", ");
}

module.exports = { formatPropertyAddress };
