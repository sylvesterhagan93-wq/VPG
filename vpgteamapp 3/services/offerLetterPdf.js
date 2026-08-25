const PDFDocument = require("pdfkit");
const {
  drawLetterhead,
  drawDocTitle,
  boldLabel,
  drawFooter,
  money,
  BRAND_NAVY,
  MUTED_GRAY,
} = require("./pdfGenerator");

/**
 * Builds the "Property Purchase Proposal" PDF attached to an Offer Letter
 * email (routes/offerLetters.js / services/emailSender.js). This is NOT a
 * HelloSign signature request - it's a plain document mailed to a seller as
 * an attachment - so there are no text tags/signature fields here, just the
 * same VPG letterhead/branding used on the e-sign documents (via the shared
 * helpers exported from pdfGenerator.js) applied to the two-option proposal
 * layout Sylvester provided.
 *
 * fields: {
 *   sellerName, propertyAddress (full mailing-style string),
 *   cashOfferAmount, cashClosingTimeframe,
 *   conciergeOfferAmount, conciergeClosingTimeframe,
 *   signerName, signerTitle, additionalNotes
 * }
 *
 * Returns a Promise<Buffer>.
 */
function generateOfferLetterPdf(fields) {
  const {
    sellerName,
    propertyAddress,
    cashOfferAmount,
    cashClosingTimeframe,
    conciergeOfferAmount,
    conciergeClosingTimeframe,
    signerName,
    signerTitle,
    additionalNotes,
  } = fields;

  const cashAmountDisplay = money(cashOfferAmount);
  const conciergeAmountDisplay = money(conciergeOfferAmount);
  const cashTimeframe = cashClosingTimeframe || "____________";
  const conciergeTimeframe = conciergeClosingTimeframe || "____________";

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 54, size: "LETTER", bufferPages: true });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const body = (text, opts) => doc.font("Helvetica").fontSize(10.5).text(text, opts).moveDown(0.5);
    const bullets = (items) => {
      doc.font("Helvetica").fontSize(10.5);
      items.forEach((item) => {
        doc.text(`•  ${item}`, { indent: 4 });
      });
      doc.moveDown(0.5);
    };
    const optionHeading = (text) => {
      doc.moveDown(0.4);
      doc.font("Helvetica-Bold").fontSize(12.5).fillColor(BRAND_NAVY).text(text);
      doc.fillColor("#000000");
      doc.moveDown(0.3);
    };
    // Bold navy label followed by a normal-weight value on the SAME line
    // (e.g. "Property: 123 Main St") - uses the same continued-text
    // technique as pdfGenerator.js's tagLine(), just without the white ink.
    const labelValue = (label, value, size) => {
      doc.font("Helvetica-Bold").fontSize(size || 10.5).fillColor(BRAND_NAVY).text(`${label} `, { continued: true });
      doc.font("Helvetica").fillColor("#000000").text(value);
    };

    drawLetterhead(doc);
    drawDocTitle(doc, "PROPERTY PURCHASE PROPOSAL");

    labelValue("Property:", propertyAddress);
    labelValue("Prepared by:", "Venture Property Group, LLC");
    doc.moveDown(0.6);

    body(
      `Thank you for the opportunity to present two options for the sale of your property${
        sellerName ? `, ${sellerName}` : ""
      }. Our goal is to provide flexibility based on what matters most to you — a quick and simple cash sale ` +
      "or the opportunity to potentially walk away with more money."
    );

    optionHeading(`OPTION #1 — CASH OFFER | ${cashAmountDisplay} NET TO SELLER`);
    labelValue("Offer:", `${cashAmountDisplay} Cash — Net to Seller`);
    labelValue("Closing:", `Approximately ${cashTimeframe}`);
    doc.moveDown(0.3);
    doc.font("Helvetica-Bold").fontSize(10.5).text(
      "Venture Property Group, LLC and/or its funding partners and investors would purchase the property directly for cash."
    );
    doc.moveDown(0.3);
    bullets([
      `${cashAmountDisplay} net to you`,
      "We pay all agreed closing costs, commissions, and fees",
      "No traditional financing contingency",
      "Quick and straightforward closing process",
      "Current photos will be needed to confirm the overall condition and integrity of the home",
    ]);
    labelValue(
      "Best for:",
      "A seller who values speed, certainty, and a simple transaction with minimal involvement, aside from a few scheduled walkthroughs with our vetted contractors."
    );

    optionHeading(`OPTION #2 — CONCIERGE SALE | POTENTIAL ${conciergeAmountDisplay} NET TO SELLER`);
    body(
      `With our Concierge Sale Option, Venture Property Group, LLC would work to bring a qualified end buyer to the ` +
      `property, providing the opportunity to potentially net approximately ${conciergeAmountDisplay}.`
    );
    bullets([
      "Our fee would be paid by the buyer, not the seller",
      `Potential seller net of approximately ${conciergeAmountDisplay}`,
      `Estimated closing timeframe of ${conciergeTimeframe}`,
      "Requires seller cooperation, property access, inspections, and teamwork throughout the process",
      "Current photos will be needed upfront to confirm the condition and integrity of the home",
    ]);
    labelValue(
      "Best for:",
      "A seller willing to invest a little more time and cooperation upfront in exchange for the opportunity to " +
      "potentially walk away with significantly more money. This option requires seller participation throughout " +
      "the process, along with current photos to confirm the condition and integrity of the home."
    );

    if (additionalNotes && additionalNotes.trim()) {
      doc.moveDown(0.4);
      boldLabel(doc, "Additional Notes:", 10.5);
      body(additionalNotes.trim());
    }

    doc.addPage();
    drawDocTitle(doc, "TWO OPTIONS. YOU CHOOSE WHAT WORKS BEST.");

    labelValue("Option #1 — Quick & Easy:", `${cashAmountDisplay} Cash Net | ${cashTimeframe}`);
    labelValue("Option #2 — Higher Potential Net:", `Approximately ${conciergeAmountDisplay} | ${conciergeTimeframe}`);
    doc.moveDown(0.6);

    body("We are prepared to work with whichever option best fits your financial goals and preferred timeline.");
    doc.font("Helvetica-Bold").fontSize(10.5).text(
      "However, both offers are subject to our review of current photos confirming the condition of the home and " +
      "all structures on the property. After reviewing the photos, the proposed amounts may increase or decrease " +
      "based on the property's actual condition."
    );
    doc.moveDown(1.2);

    boldLabel(doc, "Venture Property Group, LLC", 10.5);
    doc.moveDown(0.8);
    doc.font("Helvetica").fontSize(10.5).text(signerName || "Sylvester Hagan Jr.");
    doc.font("Helvetica").fontSize(9.5).fillColor(MUTED_GRAY).text(signerTitle || "Authorized Representative");
    doc.fillColor("#000000");

    drawFooter(doc);
    doc.end();
  });
}

module.exports = { generateOfferLetterPdf };
