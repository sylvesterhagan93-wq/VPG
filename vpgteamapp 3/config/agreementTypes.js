// Central definition of the 4 agreement types, their signer roles, and their
// form fields. Add/edit fields here and they automatically show up on the
// form, in the generated PDF, and in the dashboard.

// Venture Property Group, LLC is always the Buyer entity on the Purchase
// Agreement, and always the Assignor entity on the Assignment Agreement
// (per the real templates) - the individual signer is whoever on the team
// is sending it, signing on the company's behalf.
const BUYER_ENTITY_NAME = "Venture Property Group, LLC";
const ASSIGNOR_TITLE = "Managing Member";

// The person who signs on behalf of Venture Property Group, LLC (Buyer
// Representative on Purchase/Novation, Assignor Representative on
// Assignment) is always Sylvester - locked, not editable by anyone else on
// the team. This is enforced server-side in routes/agreements.js, not just
// hidden in the UI, so it can't be changed by editing the form or posting
// directly to the route.
const VPG_PRINCIPAL = { name: "Sylvester Hagan", email: "sylvesterhagan93@gmail.com" };

// Every deal can use a different title/escrow company, so this same set of
// fields is reused (with a shared "Escrow / Title Company" form section) on
// Purchase, Novation, and Assignment agreements - only the company name is
// required, the rest just make the PDF and signers' contact info more
// complete when you have it.
function escrowFields(defaults = {}) {
  return [
    { key: "escrow_company", label: "Escrow / Title Company Name", type: "text", required: true, section: "Escrow / Title Company", default: defaults.escrow_company },
    { key: "escrow_contact_name", label: "Escrow Contact Person", type: "text", section: "Escrow / Title Company", default: defaults.escrow_contact_name },
    { key: "escrow_phone", label: "Escrow Phone Number", type: "text", section: "Escrow / Title Company", default: defaults.escrow_phone },
    { key: "escrow_email", label: "Escrow Email", type: "text", section: "Escrow / Title Company", default: defaults.escrow_email },
    { key: "escrow_address", label: "Escrow Company Address", type: "text", section: "Escrow / Title Company", default: defaults.escrow_address },
  ];
}

const AGREEMENT_TYPES = {
  purchase: {
    key: "purchase",
    label: "Purchase Agreement",
    description: "Wholesale purchase agreement between a Seller and Venture Property Group, LLC.",
    signers: [
      { key: "seller", label: "Seller(s)", multiple: true, addButtonLabel: "Seller" },
      { key: "buyer_rep", label: `Buyer Representative (signs on behalf of ${BUYER_ENTITY_NAME})`, internal: true },
    ],
    fields: [
      { key: "agreement_date", label: "Agreement Date", type: "date", required: true },
      { key: "property_address", label: "Property Address (street, city, state, ZIP)", type: "text", required: true },
      { key: "county_line", label: "County / State (e.g., Hillsborough County, FL)", type: "text", required: true },
      { key: "purchase_price", label: "Purchase Price ($)", type: "text", required: true },
      { key: "deposit_amount", label: "Non-Refundable Deposit Held in Escrow ($)", type: "text", required: true },
      ...escrowFields(),
      { key: "closing_days", label: "Closing (business days from Effective Date)", type: "text", required: true },
      { key: "inspection_days", label: "Inspection Period (business days from Effective Date)", type: "text", required: true },
      { key: "additional_terms", label: "Additional Terms", type: "textarea" },
    ],
  },

  novation: {
    key: "novation",
    label: "Novation Agreement",
    description:
      "Ohio wholesale purchase agreement bundled with the Novation & Indemnification Agreement and " +
      "Authorization to Sign (power of attorney), so Venture Property Group can novate the deal to a third-party purchaser.",
    signers: [
      { key: "seller", label: "Seller(s)", multiple: true, addButtonLabel: "Seller" },
      { key: "buyer_rep", label: `Buyer Representative / Managing Member (signs on behalf of ${BUYER_ENTITY_NAME})`, internal: true },
    ],
    fields: [
      { key: "agreement_date", label: "Agreement Date", type: "date", required: true },
      { key: "property_address", label: "Property Address (street, city, state, ZIP)", type: "text", required: true },
      { key: "county_name", label: "County (Ohio)", type: "text", required: true },
      { key: "purchase_price", label: "Purchase Price ($)", type: "text", required: true },
      { key: "deposit_amount", label: "Deposit Held in Escrow ($)", type: "text", required: true },
      ...escrowFields({
        escrow_company: "American Title Solutions",
        escrow_contact_name: "Stephen Carter",
        escrow_phone: "330-835-4430",
        escrow_email: "Stephen@americantitlesolutions.com",
        escrow_address: "275 Springside Drive, Suite 100, Akron, Ohio 44333",
      }),
      { key: "closing_days", label: "Closing (business days from Effective Date)", type: "text", required: true },
      { key: "inspection_days", label: "Inspection Period (business days from Effective Date)", type: "text", required: true },
      { key: "governing_state", label: "Governing Law State", type: "text", required: true, default: "Ohio" },
      { key: "seller_net_proceeds", label: "Seller Net Proceeds / Net Price ($)", type: "text", required: true },
      { key: "additional_terms", label: "Additional Terms", type: "textarea" },
    ],
  },

  assignment: {
    key: "assignment",
    label: "Assignment Agreement",
    description: `Assigns ${BUYER_ENTITY_NAME}'s rights under a Purchase Agreement to an end buyer (Assignee).`,
    signers: [
      { key: "assignor_rep", label: `Assignor Representative (signs on behalf of ${BUYER_ENTITY_NAME})`, internal: true },
      { key: "assignee", label: "Assignee", multiple: true, addButtonLabel: "Assignee" },
    ],
    fields: [
      { key: "agreement_date", label: "Agreement Date (signed and delivered as of)", type: "date", required: true },
      { key: "property_address", label: "Property Address", type: "text", required: true },
      { key: "original_seller_name", label: "Original Seller(s) (from the Purchase Agreement)", type: "text", required: true },
      { key: "original_agreement_date", label: "Original Purchase Agreement Date", type: "date", required: true },
      { key: "assignment_consideration", label: "Assignment Consideration - Gross Amount ($, includes original sales price)", type: "text", required: true },
      { key: "assignment_deposit", label: "Assignment Earnest Money Deposit ($)", type: "text", required: true },
      { key: "settlement_date", label: "Settlement / Closing Date", type: "date", required: true },
      { key: "assignee_entity_name", label: "Assignee Entity Name", type: "text", required: true },
      { key: "assignee_title", label: "Assignee Signer Title (e.g., Member, Manager)", type: "text" },
      ...escrowFields(),
    ],
  },

  addendum: {
    key: "addendum",
    label: "Addendum",
    description: "Amends or adds terms to an existing, previously signed agreement.",
    signers: [
      { key: "party_one", label: "Party 1" },
      { key: "party_two", label: "Party 2" },
    ],
    fields: [
      { key: "related_agreement", label: "Related Agreement / Contract Reference", type: "text", required: true },
      { key: "property_address", label: "Property Address", type: "text" },
      { key: "effective_date", label: "Effective Date", type: "date" },
      { key: "changes", label: "Details of Addendum / Changes", type: "textarea", required: true },
    ],
  },
};

function getType(key) {
  return AGREEMENT_TYPES[key] || null;
}

module.exports = { AGREEMENT_TYPES, getType, BUYER_ENTITY_NAME, ASSIGNOR_TITLE, VPG_PRINCIPAL };
