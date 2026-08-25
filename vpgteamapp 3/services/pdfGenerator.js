const PDFDocument = require("pdfkit");
const { getType, BUYER_ENTITY_NAME, ASSIGNOR_TITLE } = require("../config/agreementTypes");
const { flattenSigners, entriesForRole, namesForRole, joinNames } = require("./signerUtils");

/**
 * Builds the PDF for the given agreement so it can be sent to HelloSign for
 * signature. All four document types use dedicated layouts that mirror
 * VPG's real documents.
 *
 * Signature/date lines are marked with HelloSign "text tags"
 * (e.g. [sig|req|signer1]) so HelloSign auto-places signature and date
 * fields for the right signer when the PDF is sent with use_text_tags
 * enabled (see services/hellosign.js). Signer numbers are 1-indexed, in the
 * order produced by flattenSigners() (services/signerUtils.js) - which
 * walks each type's `signers` array in config/agreementTypes.js and expands
 * any "multiple" role (e.g. two Sellers) into one entry per person.
 *
 * Returns a Promise<Buffer>.
 */
function generateAgreementPdf({ type, fields, signers }) {
  const typeDef = getType(type);
  if (!typeDef) throw new Error(`Unknown agreement type: ${type}`);

  if (type === "purchase") {
    return generatePurchaseAgreementPdf({ typeDef, fields, signers });
  }

  if (type === "assignment") {
    return generateAssignmentAgreementPdf({ typeDef, fields, signers });
  }

  if (type === "novation") {
    return generateNovationAgreementPdf({ typeDef, fields, signers });
  }

  if (type === "addendum") {
    return generateAddendumPdf({ typeDef, fields, signers });
  }

  // Safety net for any future type added without its own dedicated layout.
  return generateGenericAgreementPdf({ typeDef, fields, signers });
}

function ordinalDay(d) {
  const day = d.getDate();
  const suffix =
    day % 10 === 1 && day !== 11 ? "st" :
    day % 10 === 2 && day !== 12 ? "nd" :
    day % 10 === 3 && day !== 13 ? "rd" : "th";
  return `${day}${suffix}`;
}

function formatLongDate(value) {
  if (!value) return "____________";
  const d = new Date(`${value}T00:00:00`);
  if (isNaN(d.getTime())) return value;
  const month = d.toLocaleString("en-US", { month: "long" });
  const year = d.getFullYear();
  return `${ordinalDay(d)} day of ${month}, ${year}`;
}

/**
 * Renders the escrow/title company contact info as one readable line, e.g.
 * "ABC Title Co., Jane Smith, (555) 123-4567, jane@abctitle.com, 100 Main
 * St, Suite 2, Tampa, FL 33602." Only the fields that were actually filled
 * in are included.
 */
function escrowLine(fields) {
  const parts = [
    fields.escrow_company,
    fields.escrow_contact_name,
    fields.escrow_phone,
    fields.escrow_email,
    fields.escrow_address,
  ].filter((v) => v && String(v).trim());
  return parts.length ? parts.join(", ") : "____________________";
}

function money(v) {
  if (!v) return "____________";
  let trimmed = String(v).trim();
  if (trimmed.startsWith("$")) trimmed = trimmed.slice(1);
  const numeric = Number(trimmed.replace(/,/g, ""));
  if (!isNaN(numeric) && trimmed.replace(/,/g, "").match(/^\d+(\.\d+)?$/)) {
    return `$${numeric.toLocaleString("en-US", { minimumFractionDigits: numeric % 1 === 0 ? 0 : 2, maximumFractionDigits: 2 })}`;
  }
  return `$${trimmed}`;
}

/**
 * Purchase Agreement - mirrors VPG's real wholesale purchase agreement
 * template. Fixed contract language stays as-is; only the bracketed values
 * below come from the form.
 */
function generatePurchaseAgreementPdf({ typeDef, fields, signers }) {
  const flat = flattenSigners(typeDef, signers);
  const sellerEntries = entriesForRole(flat, "seller");
  const sellerNamesJoined = joinNames(namesForRole(flat, "seller"));
  const sellerDefinedTerm =
    sellerEntries.length > 1 ? `${sellerNamesJoined} (collectively, "Seller")` : `${sellerNamesJoined} ("Seller")`;
  const buyerRepEntry = entriesForRole(flat, "buyer_rep")[0];
  const buyerRepName = buyerRepEntry?.name || "____________________";
  const buyerTag = buyerRepEntry?.tag;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 54, size: "LETTER" });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const body = (text, opts) => doc.font("Helvetica").fontSize(10.5).text(text, opts);
    const heading = (text) => {
      doc.moveDown(0.8);
      doc.font("Helvetica-Bold").fontSize(11).text(text);
      doc.moveDown(0.2);
    };

    doc.font("Helvetica-Bold").fontSize(13).text(
      `THIS AGREEMENT is made this ${formatLongDate(fields.agreement_date)} by and between ` +
      `${sellerDefinedTerm} and ${BUYER_ENTITY_NAME} ("Buyer"). `,
      { continued: false }
    );
    doc.font("Helvetica").fontSize(10.5).text(
      'The parties agree that Seller shall sell and Buyer shall buy the following described Real ' +
      'Property ("Property") pursuant to the terms and conditions of this Contract and any addenda ("Agreement").'
    );

    heading("1. PROPERTY DESCRIPTION.");
    body(`Street address, city, state, zip: ${fields.property_address || "____________________"}`);
    body(`Located in ${fields.county_line || "____________________"}`);

    heading("2. PURCHASE PRICE.");
    body(`Buyer agrees to pay Seller ${money(fields.purchase_price)} ("Purchase Price").`);
    body(`Funds to be held in Escrow: ${money(fields.deposit_amount)} ("Non-Refundable Deposit").`);

    heading("3. ESCROW.");
    body(
      `The Deposit shall be made payable, delivered to and held by the Escrow company: ${escrowLine(fields)}.`
    );

    heading("4. CLOSING.");
    body(
      `Closing of this transaction shall occur on or before ${fields.closing_days || "____"} business days OR as soon ` +
      "as title is clear from the Effective Date (\"Closing\"), unless delayed by other provisions of this Agreement " +
      "or modified by the parties in writing. Buyer shall be given sole possession of Property at closing. If the " +
      "Property is not vacant, Buyer may extend closing until Seller delivers possession. Time is of the essence. " +
      "Any personal property located on the property after Closing becomes the property of the Buyer."
    );

    heading("5. CONDITION OF PROPERTY.");
    body(
      'The Parties agree that the Property is being sold "As-Is" with all defects being at the sole risk of Buyer. ' +
      "Seller shall not be responsible for any repairs of any kind whatsoever. Seller does not warrant the condition " +
      "of the Property or the improvements thereon. Seller shall maintain the property in its current condition " +
      "until Closing except for normal wear and tear."
    );

    heading("6. CLOSING COSTS.");
    body(
      "Buyer shall pay: all closing costs, title insurance, title search, municipal lien search, inspections, " +
      "survey, if any, and recording fees for deed."
    );

    heading("7. INSPECTIONS, MAINTENANCE AND ACCESS.");
    body(
      `Buyer shall have ${fields.inspection_days || "____"} days of business from the Effective Date to perform ` +
      "inspections on the Property. Prior to the end of the Inspection period, if Buyer determines that the " +
      "Property is not suitable for Buyer's use, Buyer may terminate this Agreement and Deposit will be returned " +
      "in full, thereby releasing the parties from all further obligations under this."
    );

    heading("8. ACCESS.");
    body(
      "The risk of loss shall remain with the Seller until Closing. Seller will provide Buyer and its inspectors, " +
      "contractors, appraisers and prospective partners and client's reasonable access to the Property."
    );

    heading("9. TITLE EVIDENCE AND INSURANCE.");
    body(
      "Buyer shall obtain a title commitment and owners policy from Escrow Agent, who shall also act as Title " +
      "Agent and Closing Agent. Buyer shall notify Seller of any title defects. Closing may be delayed for up to " +
      "thirty (30) days to clear title. If not cleared within the thirty (30) days, Buyer may terminate this " +
      "Agreement, or Buyer may extend Agreement for the purposes of clearing title. In the event Buyer terminates " +
      "this Agreement, Buyer shall be refunded the Deposit. Seller shall cooperate with clearing any title defects."
    );

    heading("10. DISCLOSURES.");
    body(
      "Buyer is a private investment company that purchases real estate to make a profit and may be purchasing " +
      "the Property for immediate re-sale. Seller represents the Property is not subject to a lease and Seller " +
      "shall deliver possession at Closing."
    );

    heading("11. DEFAULT; ATTORNEY FEES/COSTS.");
    body(
      "If Buyer fails to perform Buyer's obligations under this Agreement, Seller's sole remedy shall be " +
      "forfeiture of the Deposit as liquidated damages and in full settlement of any and all claims, in which case " +
      "the Parties will be relieved from any further liability under this Agreement. If Seller fails to perform " +
      "Seller's obligations under this Agreement, including Closing, Buyer shall have all legal and equitable " +
      "remedies, including the right to seek specific performance. In any litigation arising out of this " +
      "Agreement, the prevailing party shall be entitled to recover from the non-prevailing party costs and fees, " +
      "including reasonable attorney's fees. This Paragraph 11 shall survive Closing or termination of this " +
      "Agreement."
    );

    heading("12. MISCELLANEOUS PROVISIONS.");
    body(
      "a. This Agreement contains the full and complete understanding and agreements of Buyer and Seller. No " +
      "modification or change to this Agreement shall be valid or binding upon Buyer or Seller unless in writing " +
      "and executed by the Parties."
    );
    body("b. This Agreement shall be construed in accordance with the laws of the State of Florida.");
    body("c. The Effective Date is the date on which the last party initials or signs the latest offer.");
    body(
      "d. If Property is vacant, Seller agrees to provide Buyer with a key and access to the Property for the " +
      "purposes outlined in this Agreement. Buyer shall not occupy Property prior to Closing."
    );
    body(`e. Additional Terms: ${fields.additional_terms || "None."}`);

    doc.moveDown(0.6);
    body(
      `${BUYER_ENTITY_NAME} is entitled to the delta, or the difference, between the seller price and the buyer ` +
      "price as stipulated in the agreement, subject to the terms and conditions outlined therein."
    );

    doc.moveDown(1.5);
    doc.font("Helvetica-Bold").fontSize(11).text(`Buyer: ${BUYER_ENTITY_NAME}`);
    doc.moveDown(0.6);
    doc.font("Helvetica").fontSize(10.5).text(`By: ${buyerRepName}                              [sig|req|${buyerTag}]`);
    doc.moveDown(0.3);
    doc.text(`Date:                              [da|req|${buyerTag}]`);

    doc.moveDown(1.2);
    doc.font("Helvetica-Bold").fontSize(11).text("Seller(s):");
    doc.moveDown(0.6);
    sellerEntries.forEach((entry) => {
      doc.font("Helvetica").fontSize(10.5).text(`${entry.name}                              [sig|req|${entry.tag}]`);
      doc.moveDown(0.3);
      doc.text(`Date:                              [da|req|${entry.tag}]`);
      doc.moveDown(0.6);
    });

    doc.end();
  });
}

/**
 * Assignment Agreement - mirrors VPG's real "Assignment of Sales Contract
 * for Real Estate" template. Venture Property Group, LLC is always the
 * Assignor (it was Buyer under the original Purchase Agreement); the
 * Assignee is the end buyer taking over the contract.
 */
function generateAssignmentAgreementPdf({ typeDef, fields, signers }) {
  const flat = flattenSigners(typeDef, signers);
  const assignorRepEntry = entriesForRole(flat, "assignor_rep")[0];
  const assignorRepName = assignorRepEntry?.name || "____________________";
  const assignorTag = assignorRepEntry?.tag;
  const assigneeEntries = entriesForRole(flat, "assignee");

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 54, size: "LETTER" });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const body = (text) => doc.font("Helvetica").fontSize(10.5).text(text).moveDown(0.6);

    doc.font("Helvetica-Bold").fontSize(13).text("ASSIGNMENT OF SALES CONTRACT FOR REAL ESTATE", { align: "center" });
    doc.fontSize(10.5).font("Helvetica").text(`Address: ${fields.property_address || "____________________"}`, { align: "center" });
    doc.moveDown(1);

    body(
      `FOR VALUABLE CONSIDERATION in the gross amount of ${money(fields.assignment_consideration)} (which amount ` +
      "shall include the sales price in the original purchase contract), the sufficiency of which is acknowledged, " +
      `${BUYER_ENTITY_NAME} ("Assignor") hereby assigns to ${fields.assignee_entity_name || "____________________"} ` +
      `("Assignee"), all of Assignor's right, title and interest in and to the Purchase and Sale Agreement dated ` +
      `${formatLongDate(fields.original_agreement_date)} between the Sellers, ${fields.original_seller_name || "____________________"}, ` +
      `and ${BUYER_ENTITY_NAME} as Buyer (the "Purchase Agreement").`
    );

    body(
      "In consideration for this Assignment, Assignee shall deposit with the Escrow/Title company via wire " +
      "transfer or check within five (5) business hours from the Execution of this Assignment (or following " +
      `business day), the amount of ${money(fields.assignment_deposit)} ("Assignment Earnest Money Deposit"). If ` +
      "Assignee elects to wire transfer, Assignee shall provide a copy of the wire confirmation to Assignor " +
      "evidencing that the wire was timely completed (including the federal reference number) within one (1) " +
      "business day from Execution of this Assignment. Time is of the essence as to the timeframes in this " +
      "paragraph. Failure to strictly adhere to any timeframe under this agreement shall permit, but not require, " +
      "Assignor to void this Assignment Agreement and relieve Assignor of any and all liability to Assignee. In " +
      "the event Assignor elects to void this Assignment Agreement, Assignor shall instruct escrow to refund to " +
      "Assignee any deposits made by Assignee."
    );

    body(
      "As part of the Assignment Earnest Money Deposit herein, Assignee shall replace the $0.00 Earnest Money " +
      "Deposit Assignor has on deposit, pursuant to the Sales Contract for Real Estate. Upon receipt and " +
      "verification of the Assignment Earnest Money Deposit, escrow is authorized to release the Sale Contract " +
      "for Real Estate deposit amount of $0.00 to Assignor."
    );

    body(
      "Assignor represents and warrants to Assignee that (1) the Purchase Agreement is in full force and effect " +
      "and has not been modified in any way (other than by any amendment or modification referred to in the " +
      "definition of Purchase Agreement above), (2) Assignor's interest in the Purchase Agreement is free and " +
      "clear of any prior assignment and of any lien or security interest, (3) Assignor has good right and " +
      "lawful authority to execute and deliver this Assignment and to assign to Assignee all of Assignor's " +
      "interest in the Purchase Agreement, (4) no party to the Purchase Agreement is presently in default with " +
      "respect to the performance of such party's obligations under the Purchase Agreement, (5) all materials " +
      "relating to this project have been delivered to the Assignee and all reports shall be assigned to the " +
      "Assignee, and Buyer shall pay all closing costs, (6) all expenses incurred by the Assignor prior to this " +
      "agreement shall be the responsibility of the Assignor, and (7) no broker is entitled to a broker fee, " +
      "other than those identified in the Purchase Agreement or by separate written agreement between Assignor " +
      "and Assignee."
    );

    body(
      "By accepting this Assignment, Assignee assumes and agrees to perform all of the obligations of the Buyer " +
      "under the Purchase Agreement, including but not limited to any obligations to be performed after closing " +
      "thereunder, and to indemnify Assignor against any loss, claim, damage or expense Assignor may incur by " +
      "reason of Assignee's failure to perform the assumed obligations on a timely basis."
    );

    body(
      "This Assignment shall be interpreted under the laws of the county or city jurisdiction where the Property " +
      "resides, and any disputes in connection with this Assignment shall be exclusively brought in one of the " +
      "courts in that location. Buyer to pay all closing costs. In the event that any party shall be required to " +
      "enforce its rights under this Assignment agreement, the prevailing party shall be entitled to " +
      "reimbursement for court costs and reasonable attorney's fees."
    );

    body(
      `Assignee must make Settlement on Property on or before ${formatLongDate(fields.settlement_date)}. If ` +
      "Assignee does not purchase/close on above said property by this date due to any type of Assignee default, " +
      "Assignee shall be responsible to pay in full said Assignment consideration to Assignor and closing costs. " +
      "In addition, Title Company shall immediately release the full Assignment Earnest Money Deposit to the " +
      "Assignor. This shall also serve as a release of contract and the Assignor is permitted to sell the " +
      "property to any other parties without any recourse by the assignee/purchaser. If Settlement does not " +
      "occur on or before this date due to reasons other than Assignee default, closing may be extended for up " +
      "to 30 days, at option of Assignor. This paragraph shall supersede any and all contingent terms that were " +
      "in the original Sales Contract for Real Estate."
    );

    body(`Signed and delivered as of ${formatLongDate(fields.agreement_date)}.`);
    body(`Escrow / Title Company: ${escrowLine(fields)}`);

    doc.moveDown(1);
    doc.font("Helvetica-Bold").fontSize(11).text("By");
    doc.moveDown(0.4);
    doc.font("Helvetica").fontSize(10.5).text(`Signor: ${BUYER_ENTITY_NAME}                    [sig|req|${assignorTag}]`);
    doc.text(`By: ${assignorRepName}`);
    doc.text(`Title: ${ASSIGNOR_TITLE}`);
    doc.moveDown(0.3);
    doc.text(`Date:                              [da|req|${assignorTag}]`);

    doc.moveDown(1.2);
    doc.font("Helvetica-Bold").fontSize(11).text("ASSIGNEE:");
    doc.moveDown(0.4);
    doc.font("Helvetica").fontSize(10.5).text(`Entity: ${fields.assignee_entity_name || "____________________"}`);
    assigneeEntries.forEach((entry) => {
      doc.text(`By: ${entry.name}                    [sig|req|${entry.tag}]`);
      doc.text(`Title: ${fields.assignee_title || "____________________"}`);
      doc.moveDown(0.3);
      doc.text(`Date:                              [da|req|${entry.tag}]`);
      doc.moveDown(0.6);
    });

    doc.end();
  });
}

/**
 * Novation Agreement - mirrors VPG's real Ohio novation package, which
 * bundles three documents into one signing packet:
 *   1. The wholesale Purchase Agreement (Ohio variant, with an
 *      Assignability & Novation clause and a fixed escrow agent),
 *   2. The Novation and Indemnification Agreement itself (transfers the
 *      deal to a to-be-determined Third-Party Purchaser), and
 *   3. An Authorization to Sign / limited power of attorney letting VPG
 *      list and sign on the Seller's behalf.
 * Seller and the Buyer Representative (VPG's Managing Member) sign
 * throughout - the same two HelloSign signers apply to all three sections.
 */
function generateNovationAgreementPdf({ typeDef, fields, signers }) {
  const flat = flattenSigners(typeDef, signers);
  const sellerEntries = entriesForRole(flat, "seller");
  const sellerNamesJoined = joinNames(namesForRole(flat, "seller"));
  const sellerDefinedTerm =
    sellerEntries.length > 1 ? `${sellerNamesJoined} (collectively, "Seller")` : `${sellerNamesJoined} ("Seller")`;
  const buyerRepEntry = entriesForRole(flat, "buyer_rep")[0];
  const buyerRepName = buyerRepEntry?.name || "____________________";
  const buyerTag = buyerRepEntry?.tag;
  const buyerEntityFull = `${BUYER_ENTITY_NAME}, a New Mexico Limited Liability Company`;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 54, size: "LETTER" });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const body = (text) => doc.font("Helvetica").fontSize(10.5).text(text).moveDown(0.6);
    const heading = (text) => {
      doc.moveDown(0.6);
      doc.font("Helvetica-Bold").fontSize(11).text(text);
      doc.moveDown(0.2);
    };
    const docTitle = (text) => {
      doc.font("Helvetica-Bold").fontSize(13).text(text, { align: "center" });
      doc.moveDown(0.8);
    };
    const signatureLine = (label, name, tag, extra) => {
      doc.font("Helvetica").fontSize(10.5).text(`${label}: ${name}                    [sig|req|${tag}]`);
      if (extra) doc.text(extra);
      doc.moveDown(0.3);
      doc.text(`Date:                              [da|req|${tag}]`);
      doc.moveDown(0.8);
    };
    // Same as signatureLine, but for a role that can have multiple signers
    // (e.g. two Sellers) - renders one signature+date line per person.
    const signatureLines = (label, entries) => {
      entries.forEach((entry) => signatureLine(label, entry.name, entry.tag));
    };

    // ---------- SECTION 1: PURCHASE AGREEMENT ----------
    docTitle("PURCHASE AGREEMENT");

    doc.font("Helvetica-Bold").fontSize(13).text(
      `THIS AGREEMENT is made this ${formatLongDate(fields.agreement_date)}, by and between ` +
      `${sellerDefinedTerm} and ${BUYER_ENTITY_NAME} ("Buyer"), or assigns. `
    );
    doc.font("Helvetica").fontSize(10.5).text(
      'The parties agree that Seller shall sell and Buyer shall buy the following described Real ' +
      'Property ("Property") pursuant to the terms and conditions of this Contract and any addenda ("Agreement").'
    );

    heading("PROPERTY DESCRIPTION.");
    body(`Street address, city, state, zip: ${fields.property_address || "____________________"}`);
    body(`Located in ${fields.county_name || "____________________"} County, OH.`);

    heading("PURCHASE PRICE.");
    body(`Buyer agrees to pay Seller ${money(fields.purchase_price)} ("Purchase Price").`);
    body(`Funds to be held in Escrow: ${money(fields.deposit_amount)} ("Deposit").`);

    heading("ESCROW.");
    body(
      `The Deposit shall be made payable, delivered to and held by the Escrow Agent: ${escrowLine(fields)}.`
    );

    heading("CLOSING.");
    body(
      `Closing of this transaction shall occur on or before ${fields.closing_days || "____"} days of business OR ` +
      "sooner from the Effective Date (\"Closing\"), unless delayed by other provisions of this Agreement or " +
      "modified by the parties in writing. Buyer shall be given sole possession of Property at closing. If the " +
      "Property is not vacant, Buyer may extend closing until Seller delivers possession. Time is of the essence. " +
      "Any personal property located on the property after Closing becomes the property of the Buyer."
    );

    heading("CONDITION OF PROPERTY.");
    body(
      'The Parties agree that the Property is being sold "As-Is" with all defects being at the sole risk of Buyer. ' +
      "Seller shall not be responsible for any repairs of any kind whatsoever. Seller does not warrant the condition " +
      "of the Property or the improvements thereon. Seller shall maintain the property in its current condition " +
      "until Closing except for normal wear and tear."
    );

    heading("CLOSING COSTS.");
    body(
      "Buyer shall pay: all closing costs, title insurance, title search, municipal lien search, inspections, " +
      "survey, if any, and recording fees for deed."
    );

    heading("INSPECTIONS, MAINTENANCE AND ACCESS.");
    body(
      `Buyer shall have ${fields.inspection_days || "____"} days of business from the Effective Date to perform ` +
      "inspections on the Property. Prior to the end of the Inspection period, if Buyer determines that the " +
      "Property is not suitable for Buyer's use, Buyer may terminate this Agreement and Deposit will be returned " +
      "in full, thereby releasing the parties from all further obligations under this."
    );

    heading("ACCESS.");
    body(
      "The risk of loss shall remain with the Seller until Closing. Seller will provide Buyer and its inspectors, " +
      "contractors, appraisers and prospective partners and client's reasonable access to the Property."
    );

    heading("TITLE EVIDENCE AND INSURANCE.");
    body(
      "Buyer shall obtain a title commitment and owners policy from Escrow Agent, who shall also act as Title " +
      "Agent and Closing Agent. Buyer shall notify Seller of any title defects. Closing may be delayed for up to " +
      "thirty (30) days to clear title. If not cleared within the thirty (30) days, Buyer may terminate this " +
      "Agreement, or Buyer may extend Agreement for the purposes of clearing title. In the event Buyer terminates " +
      "this Agreement, Buyer shall be refunded the Deposit. Seller shall cooperate with clearing any title defects."
    );

    heading("ASSIGNABILITY & NOVATION.");
    body(
      "Buyer reserves the right to assign this agreement to a third-party purchaser, or to novate this agreement " +
      "with a replacement agreement with a third-party purchaser, and in either such event, Seller shall cooperate " +
      "fully, at Buyer's request, to transfer title to the Property directly to the third-party purchaser; " +
      "provided, however, that Buyer shall be responsible for all additional transfer tax payable by Seller as a " +
      "result of the assignment/novation."
    );

    heading("DISCLOSURES.");
    body(
      "Buyer is a private investment company that purchases real estate to make a profit and may be purchasing " +
      "the Property for immediate re-sale. Seller consents to Buyer marketing Buyer's contract rights in any " +
      "manner Buyer deems appropriate, including marketing on the Multiple Listing Services. If Property includes " +
      "pre-1978 residential housing, a lead-based paint disclosure shall be executed by the parties. Seller " +
      "represents the Property is not subject to a lease and Seller shall deliver possession at Closing."
    );

    heading("DEFAULT; ATTORNEY FEES/COSTS.");
    body(
      "If Buyer fails to perform Buyer's obligations under this Agreement, Seller's sole remedy shall be " +
      "forfeiture of the Deposit as liquidated damages and in full settlement of any and all claims, in which case " +
      "the Parties will be relieved from any further liability under this Agreement. If Seller fails to perform " +
      "Seller's obligations under this Agreement, including Closing, Buyer shall have all legal and equitable " +
      "remedies, including the right to seek specific performance. In any litigation arising out of this " +
      "Agreement, the prevailing party shall be entitled to recover from the non-prevailing party costs and fees, " +
      "including reasonable attorney's fees. This paragraph shall survive Closing or termination of this Agreement."
    );

    heading("MISCELLANEOUS PROVISIONS.");
    body(
      "a. This Agreement contains the full and complete understanding and agreements of Buyer and Seller. No " +
      "modification or change to this Agreement shall be valid or binding upon Buyer or Seller unless in writing " +
      "and executed by the Parties."
    );
    body(`b. This Agreement shall be construed in accordance with the laws of the State of ${fields.governing_state || "____________"}.`);
    body("c. The Effective Date is the date on which the last party initials or signs the latest offer.");
    body(
      "d. If Property is vacant, Seller agrees to provide Buyer with a key and access to the Property for the " +
      "purposes outlined in this Agreement. Buyer shall not occupy Property prior to Closing."
    );
    body(`e. Additional Terms: ${fields.additional_terms || "None."}`);

    doc.moveDown(0.4);
    body(
      `${BUYER_ENTITY_NAME} is entitled to the delta, or the difference, between the seller price and the buyer ` +
      "price as stipulated in the agreement, subject to the terms and conditions outlined therein."
    );

    doc.moveDown(0.8);
    doc.font("Helvetica-Bold").fontSize(11).text(`BUYER: ${BUYER_ENTITY_NAME}`);
    doc.moveDown(0.4);
    signatureLine("By", buyerRepName, buyerTag);
    doc.font("Helvetica-Bold").fontSize(11).text("SELLER:");
    doc.moveDown(0.4);
    signatureLines("Signature", sellerEntries);

    // ---------- SECTION 2: NOVATION AND INDEMNIFICATION AGREEMENT ----------
    doc.addPage();
    docTitle("NOVATION AND INDEMNIFICATION AGREEMENT");

    body(
      `THIS NOVATION AND INDEMNIFICATION AGREEMENT is dated this ${formatLongDate(fields.agreement_date)}, by ` +
      `and between ${sellerNamesJoined} (hereinafter referred to as "Seller"), and ${BUYER_ENTITY_NAME} (hereinafter ` +
      'referred to as "Buyer").'
    );

    body(
      `WHEREAS, Seller and Buyer entered into an Agreement of Sale dated ${formatLongDate(fields.agreement_date)} ` +
      `(the "Agreement of Sale"), for the sale of Seller's real estate at ${fields.property_address || "____________________"} ` +
      `(the "Property"), for a purchase price of ${money(fields.purchase_price)} net price; and`
    );

    body(
      "WHEREAS, the parties have agreed that Seller may assign or novate the Agreement of Sale in favor of a new " +
      "agreement with a new buyer, permitting the Property to be transferred directly to a Third-Party Purchaser; and"
    );

    body(
      "WHEREAS, Buyer has successfully marketed the Property to be determined (the \"Third-Party Purchaser\"), " +
      "having proposed a substitute Agreement of Sale, with related addenda and other documents, to be entered " +
      "into between the Seller and the Third-Party Purchaser (together, the \"Third-Party Agreement of Sale\"), and"
    );

    body(
      "WHEREAS, the parties hereto intend to conditionally terminate the Agreement of Sale between the Buyer and " +
      "Seller under the terms and conditions herein set forth so as to structure the transfer of the Property " +
      "directly to the Third-Party Purchaser (who shall replace Buyer as the ultimate purchaser of the Property) " +
      "under the Third-Party Agreement of Sale, with substituted obligations of the parties as set forth herein."
    );

    body(
      "NOW, THEREFORE, in consideration of the mutual covenants and promises herein set forth, the parties " +
      "hereto, intending to be legally bound, do hereby agree as follows:"
    );

    body(
      `1. Venture to Execute Third-Party Real Estate Purchase Agreement. Contemporaneously with the execution of ` +
      `this Novation and Indemnity Agreement, ${BUYER_ENTITY_NAME} will execute the Third-Party Real Estate ` +
      "Purchase Agreement and all addendum related thereto."
    );

    body(
      "2. Conditional Termination of Real Estate Purchase Agreement. The Real Estate Purchase Agreement between " +
      "the Seller and Buyer is hereby conditionally terminated in accordance with the terms hereof, effective " +
      "immediately upon the execution of the Third-Party Real Estate Purchase Agreement by the Seller and the " +
      "Third-Party Purchaser. Seller agrees that all monies deposited by Buyer pursuant to the Real Estate " +
      "Purchase Agreement and held by any third party as escrow agent, shall be refunded to the Buyer immediately " +
      "upon the deposit being made by the Third-Party Purchaser under the Third-Party Real Estate Purchase " +
      "Agreement. The deposit paid by the Third-Party Purchaser shall be paid to the closing agent and applied to " +
      "the purchase price payable under the Third-Party Real Estate Purchase Agreement."
    );

    body(
      "3. Renovation and Repair Obligations to Third-Party Purchaser. Buyer agrees that it will be solely " +
      "responsible for any inspection costs, and any and all renovations, replacements and repairs required to be " +
      "made to the Property, and any appliances or services to be provided to the Third-Party Purchaser pursuant " +
      "to the Third-Party Real Estate Purchase Agreement or any addendum thereto, and that it will indemnify and " +
      "hold Seller harmless from and against any and all such obligations. Seller shall have no responsibility or " +
      "liability to perform or pay for such renovations, provided the Seller is not in default of any terms of the " +
      "Real Estate Purchase Agreement, this Novation and Indemnification Agreement, or the Third-Party Real Estate " +
      "Purchase Agreement (collectively \"Contracts\")."
    );

    body(
      "4. Indemnification. Buyer agrees to forever indemnify and hold Seller harmless from and against the " +
      "following, and agrees that the terms of this Section shall survive settlement: (A) Any and all damages, " +
      "injuries, losses, claims, suits, actions or the like arising out of or relating to Buyer's pre-settlement " +
      "possession of the Property, including all utilities (except water and sewer) charged to the Property " +
      "during the period of Buyer's pre-settlement possession. Buyer shall not cause or suffer any mechanics " +
      "liens to be filed against the Property as a result of any of its aforesaid work, and if any such mechanics " +
      "lien is filed against the Property, Buyer shall immediately and at its sole cost discharge the same and " +
      "shall indemnify and save Seller and the Property harmless from any such mechanics lien. This document does " +
      "not need to be notarized. If damage is caused to the Property during Buyer's pre-settlement possession, " +
      "except damage as may be caused by Seller, and if settlement does not occur and Buyer does not purchase the " +
      "Property, Buyer shall be liable for the cost of repair for such damage. (B) Any and all liability, claims, " +
      "suits, damages, injuries or the like arising out of or relating to Seller's obligations to the Third-Party " +
      "Purchaser under the Third-Party Real Estate Purchase Agreement, provided Seller has not defaulted under " +
      "the terms of the Contracts."
    );

    body(
      `5. Net Proceeds Payable to Seller. Upon closing under the Third-Party Real Estate Purchase Agreement, ` +
      `Seller shall retain the balance of ${money(fields.seller_net_proceeds)} net price including the ` +
      "pro-rated assessed taxes and other prorated assessments (which proration shall be made as of the date of " +
      "closing), less any payoffs for mortgages or liens, less any unpaid assessed taxes, less Seller's " +
      "attorneys' fees (if any). The Seller shall authorize the escrow agent to pay / disburse the balance of the " +
      "net proceeds immediately to the Buyer in readily available funds upon closing."
    );

    body(
      "6. Failure to Close. In the event that the Third-Party Purchaser fails to close on the purchase of the " +
      "Property as specified in the Third-Party Real Estate Purchase Agreement, whether for failure of a " +
      "contingency or otherwise, the Real Estate Purchase Agreement between Seller and Buyer shall be deemed to " +
      "be reinstated, and the parties shall then be obligated to perform pursuant to the terms of the Real Estate " +
      "Purchase Agreement. Buyer shall retain all rights within the Third-Party Real Estate Purchase Agreement to " +
      "sue Seller for specific performance or seek liquidated damages in the event seller defaults on any of " +
      "his/her obligations within the Third-Party Real Estate Purchase Agreement by refusing to close or refusing " +
      "to close timely. In lieu of electing to seek specific performance, Buyer may elect to recover liquidated " +
      "damages from seller if seller defaults on any of his collective obligations. The parties agree that " +
      "because of the complexity involved in calculating damages, liquidated damages is appropriate. Liquidated " +
      "damages shall be calculated by subtracting the seller's net proceeds identified in paragraph 5 above, from " +
      "the purchase price the Third-Party Purchaser agreed to pay."
    );

    body(
      "7. Entire Agreement. This writing shall constitute the entire understanding of the parties with respect to " +
      "the subject matter hereof. All prior understandings, written or oral, shall be deemed to be merged " +
      "herewith. This Agreement may be executed in counterparts, each of which shall be deemed to be original, " +
      "but one and the same document. Signatures transmitted by facsimile shall be enforceable the same as " +
      "originals."
    );

    body("By signing below, you understand and agree to the terms and conditions of this Agreement.");

    doc.moveDown(0.4);
    doc.font("Helvetica-Bold").fontSize(11).text(`Buyer(s): ${buyerEntityFull}`);
    doc.moveDown(0.4);
    signatureLine("Managing Member Signature", buyerRepName, buyerTag);
    doc.font("Helvetica-Bold").fontSize(11).text("Seller:");
    doc.moveDown(0.4);
    signatureLines("Signature", sellerEntries);

    // ---------- SECTION 3: AUTHORIZATION TO SIGN LISTING DOCS AND OFFERS ----------
    doc.addPage();
    docTitle("AUTHORIZATION TO SIGN LISTING DOCS AND OFFERS");

    body(
      `BE IT ACKNOWLEDGED that I/we, ${sellerNamesJoined}, the "Sellers", do hereby grant a limited and specific ` +
      `authorization to sign ${BUYER_ENTITY_NAME}, as my "Attorney-in-Fact".`
    );

    body(
      "Said Attorney-in-Fact shall have full power and authority to undertake and perform the following acts on " +
      `my behalf, related to (the "Property: ${fields.property_address || "____________________"}") for ` +
      `${money(fields.seller_net_proceeds)} net price:`
    );

    body(
      "1. Seller specifically authorizes and gives permission to the Attorney-in-Fact to list the property on " +
      "any and all multiple listing service(s) (MLS) and other online platforms for the purpose of marketing & " +
      "selling the Property. This includes executing listing agreement(s), listing agreement addendum(s), " +
      "disclosures, sales contracts, sign offers from 3rd parties and addendums."
    );

    body(
      `2. NOTICE OF INTEREST. Notice is hereby given that ${BUYER_ENTITY_NAME} ("Buyer") has an interest in that ` +
      `certain real property situated in ${fields.county_name || "____________________"} County, State of Ohio, ` +
      "by virtue of a signed Purchase Agreement with the sellers for acquisition of the real property with " +
      "inclusively agreed. This serves as a notice of interest, all parties agree."
    );

    body(
      "The authority herein shall include such incidental acts as reasonably required to carry authorities " +
      "granted herein. Seller agrees that this document does not need to be notarized."
    );

    body(
      "This authorization is effective upon execution. This authorization may be revoked when the above stated " +
      "one (1) time power or responsibility has been completed."
    );

    body(
      "This authorization form shall automatically be revoked upon my death or incapacitation, provided any " +
      "person relying on this power of attorney shall be given full rights to accept and reply upon the authority " +
      "of the Attorney-in-Fact until the receipt of actual notice of revocation."
    );

    doc.moveDown(0.4);
    doc.font("Helvetica-Bold").fontSize(11).text(`Buyer: ${buyerEntityFull}`);
    doc.moveDown(0.4);
    signatureLine("Managing Member Signature", buyerRepName, buyerTag);
    doc.font("Helvetica-Bold").fontSize(11).text("Seller:");
    doc.moveDown(0.4);
    signatureLines("Signature", sellerEntries);

    doc.end();
  });
}

/**
 * Addendum - mirrors VPG's real "Addendum to Purchase Agreement" template.
 * Amends the Purchase Price and/or Closing terms of an existing Purchase
 * Agreement. Only the Seller(s) sign - there's no Buyer/VPG signature line
 * on this one, matching the real template.
 */
function generateAddendumPdf({ typeDef, fields, signers }) {
  const flat = flattenSigners(typeDef, signers);
  const sellerEntries = entriesForRole(flat, "seller");

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 54, size: "LETTER" });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const body = (text) => doc.font("Helvetica").fontSize(10.5).text(text).moveDown(0.6);
    const heading = (text) => {
      doc.font("Helvetica-Bold").fontSize(11).text(text);
    };

    doc.font("Helvetica-Bold").fontSize(18).text("ADDENDUM TO PURCHASE AGREEMENT");
    doc.moveDown(0.8);

    doc.font("Helvetica-Bold").fontSize(10.5).text("Property Address:");
    doc.font("Helvetica").fontSize(10.5).text(fields.property_address || "____________________");
    doc.moveDown(0.8);

    body("This Addendum modifies the existing Purchase Agreement for the property referenced above.");
    body("The parties agree to the following amendments:");

    heading("1. Purchase Price");
    body(
      `The purchase price shall be amended to ${money(fields.amended_price)} ${fields.payment_terms || "CASH"} ` +
      `payable by ${BUYER_ENTITY_NAME} as Buyer.`
    );

    heading("2. Closing Date");
    body(`${BUYER_ENTITY_NAME} shall close ${fields.closing_terms || "____________________"}.`);

    heading("3. Remaining Terms");
    body(
      "All other terms, conditions, and provisions of the original Purchase Agreement shall remain unchanged " +
      "and in full force and effect."
    );

    body("By signing below, the Sellers acknowledge and agree to the amendments stated above.");

    doc.moveDown(0.4);
    doc.font("Helvetica-Bold").fontSize(11).text("SELLERS");
    doc.moveDown(0.6);

    sellerEntries.forEach((entry) => {
      doc.font("Helvetica-Bold").fontSize(10.5).text(entry.name);
      doc.moveDown(0.3);
      doc.font("Helvetica").fontSize(10.5).text(`Signature: ________                    [sig|req|${entry.tag}]`);
      doc.moveDown(0.3);
      doc.text(`Date: ____                              [da|req|${entry.tag}]`);
      doc.moveDown(0.8);
    });

    doc.end();
  });
}

/**
 * Generic fallback layout - currently unused, since all four document
 * types now have dedicated layouts above. Kept as a safety net in case a
 * new type is ever added without one.
 */
function generateGenericAgreementPdf({ typeDef, fields, signers }) {
  const flat = flattenSigners(typeDef, signers);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 54 });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(18).font("Helvetica-Bold").text("VPG", { align: "left" });
    doc.moveDown(0.2);
    doc.fontSize(16).text(typeDef.label, { align: "left" });
    doc.moveDown(0.3);
    doc.fontSize(10).font("Helvetica").fillColor("#555")
      .text(`Generated ${new Date().toLocaleString("en-US")}`, { align: "left" });
    doc.fillColor("#000");
    doc.moveDown(1);

    doc.moveTo(doc.x, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y).strokeColor("#ccc").stroke();
    doc.moveDown(1);

    doc.fontSize(12).font("Helvetica-Bold").text("Parties");
    doc.moveDown(0.3);
    doc.fontSize(11).font("Helvetica");
    typeDef.signers.forEach((s) => {
      const entries = entriesForRole(flat, s.key);
      if (entries.length === 0) {
        doc.text(`${s.label}: (not provided)`);
      } else {
        entries.forEach((entry) => doc.text(`${s.label}: ${entry.name}  <${entry.email}>`));
      }
    });

    doc.moveDown(1);
    doc.fontSize(12).font("Helvetica-Bold").text("Agreement Details");
    doc.moveDown(0.3);
    doc.fontSize(11).font("Helvetica");

    typeDef.fields.forEach((f) => {
      const value = fields[f.key];
      if (value === undefined || value === null || value === "") return;
      doc.font("Helvetica-Bold").text(`${f.label}: `, { continued: true }).font("Helvetica").text(String(value));
    });

    doc.moveDown(2);
    doc.fontSize(10).fillColor("#555").text(
      "This document was generated by VPGteamapp and sent for electronic signature. " +
      "By signing below, each party agrees to the terms described above.",
      { align: "left" }
    );

    doc.moveDown(3);

    flat.forEach((entry) => {
      doc.fontSize(11).fillColor("#000").text(`${entry.name} Signature:                              [sig|req|${entry.tag}]`);
      doc.moveDown(0.3);
      doc.text(`Date:                              [da|req|${entry.tag}]`);
      doc.moveDown(1);
    });

    doc.end();
  });
}

module.exports = { generateAgreementPdf };
