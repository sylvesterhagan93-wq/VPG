const express = require("express");
const db = require("../db/db");
const { generateOfferLetterPdf } = require("../services/offerLetterPdf");
const { sendOfferLetterEmail, isEmailConfigured } = require("../services/emailSender");

const router = express.Router();

// Defaults for a fresh form - matches the wording/signature Sylvester
// provided. Fully editable per-send (see the "Email body" question this
// feature was built around) - these are just the starting point.
const DEFAULT_CASH_CLOSING = "30–45 Days";
const DEFAULT_CONCIERGE_CLOSING = "90–120 Days or Sooner";
const DEFAULT_SIGNER_NAME = "Sylvester Hagan Jr.";
const DEFAULT_SIGNER_TITLE = "Authorized Representative";

// The exact wording Sylvester provided, with the property address dropped
// in - kept in one place so the pre-filled form and any future re-send
// logic build the same message. The client-side script in
// offer-letter-form.ejs regenerates this same text as the Property Address
// field changes, as long as the sender hasn't started customizing it.
function defaultEmailBody(propertyAddress) {
  const address = propertyAddress || "[property address]";
  return (
    "Hi,\n" +
    `It was great connecting with you regarding your property at ${address}.\n\n` +
    "I’ve attached our proposal outlining two different options for you to consider. One is designed for a " +
    "quicker and simpler cash closing, while the second provides an opportunity to potentially net significantly " +
    "more for the property with more additional time, effort and cooperation.\n\n" +
    "Please keep in mind that we will need current photos of the home and the other structures on the property " +
    "to confirm their condition. Once we review those, we can confirm the numbers and determine whether we may " +
    "be able to offer more or need to adjust them based on the actual condition.\n\n" +
    "Take a look at the attached proposal when you have a chance, and feel free to call or email me with any " +
    "questions. We’d love the opportunity to work with you and find the option that makes the most sense for " +
    "your situation.\n\n" +
    "Thank you!\n" +
    "Sylvester Hagan Jr.\n" +
    "Venture Property Group, LLC"
  );
}

function defaultEmailSubject(propertyAddress) {
  return `Property Purchase Proposal - ${propertyAddress || "[property address]"}`;
}

function blankFormValues() {
  return {
    seller_name: "",
    seller_email: "",
    property_address: "",
    cash_offer_amount: "",
    cash_closing_timeframe: DEFAULT_CASH_CLOSING,
    concierge_offer_amount: "",
    concierge_closing_timeframe: DEFAULT_CONCIERGE_CLOSING,
    additional_notes: "",
    signer_name: DEFAULT_SIGNER_NAME,
    signer_title: DEFAULT_SIGNER_TITLE,
    email_subject: defaultEmailSubject(""),
    email_body: defaultEmailBody(""),
  };
}

router.get("/offer-letters/new", (req, res) => {
  res.render("offer-letter-form", {
    error: null,
    formValues: blankFormValues(),
    userName: req.session.userName,
    emailConfigured: isEmailConfigured(),
  });
});

router.post("/offer-letters/send", async (req, res, next) => {
  const body = req.body;
  const fields = {
    seller_name: (body.seller_name || "").trim(),
    seller_email: (body.seller_email || "").trim(),
    property_address: (body.property_address || "").trim(),
    cash_offer_amount: (body.cash_offer_amount || "").trim(),
    cash_closing_timeframe: (body.cash_closing_timeframe || "").trim(),
    concierge_offer_amount: (body.concierge_offer_amount || "").trim(),
    concierge_closing_timeframe: (body.concierge_closing_timeframe || "").trim(),
    additional_notes: (body.additional_notes || "").trim(),
    signer_name: (body.signer_name || "").trim(),
    signer_title: (body.signer_title || "").trim(),
    email_subject: (body.email_subject || "").trim(),
    email_body: (body.email_body || "").trim(),
  };

  const missing = [];
  if (!fields.seller_name) missing.push("Seller Name");
  if (!fields.seller_email) missing.push("Seller Email");
  if (!fields.property_address) missing.push("Property Address");
  if (!fields.cash_offer_amount) missing.push("Cash Offer Amount");
  if (!fields.concierge_offer_amount) missing.push("Concierge Offer Amount");
  if (!fields.email_subject) missing.push("Email Subject");
  if (!fields.email_body) missing.push("Email Body");

  if (missing.length > 0) {
    return res.render("offer-letter-form", {
      error: `Please fill in: ${missing.join(", ")}`,
      formValues: fields,
      userName: req.session.userName,
      emailConfigured: isEmailConfigured(),
    });
  }

  try {
    const pdfBuffer = await generateOfferLetterPdf({
      sellerName: fields.seller_name,
      propertyAddress: fields.property_address,
      cashOfferAmount: fields.cash_offer_amount,
      cashClosingTimeframe: fields.cash_closing_timeframe,
      conciergeOfferAmount: fields.concierge_offer_amount,
      conciergeClosingTimeframe: fields.concierge_closing_timeframe,
      signerName: fields.signer_name,
      signerTitle: fields.signer_title,
      additionalNotes: fields.additional_notes,
    });

    const filename = `Property_Purchase_Proposal_${fields.property_address.replace(/[^a-z0-9]+/gi, "_")}.pdf`;

    const result = await sendOfferLetterEmail({
      to: fields.seller_email,
      subject: fields.email_subject,
      body: fields.email_body,
      pdfBuffer,
      filename,
      senderName: fields.signer_name,
    });

    await db.query(
      `INSERT INTO offer_letters
        (sent_by_user_id, seller_name, seller_email, property_address, cash_offer_amount, cash_closing_timeframe,
         concierge_offer_amount, concierge_closing_timeframe, email_subject, email_body, status, form_data)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        req.session.userId,
        fields.seller_name,
        fields.seller_email,
        fields.property_address,
        fields.cash_offer_amount,
        fields.cash_closing_timeframe,
        fields.concierge_offer_amount,
        fields.concierge_closing_timeframe,
        fields.email_subject,
        fields.email_body,
        result.mode === "mock" ? "mock_sent" : "sent",
        JSON.stringify(fields),
      ]
    );

    res.render("offer-letter-sent", { result, fields, userName: req.session.userName });
  } catch (err) {
    await db.query(
      `INSERT INTO offer_letters
        (sent_by_user_id, seller_name, seller_email, property_address, cash_offer_amount, cash_closing_timeframe,
         concierge_offer_amount, concierge_closing_timeframe, email_subject, email_body, status, error_message, form_data)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'failed', $11, $12)`,
      [
        req.session.userId,
        fields.seller_name,
        fields.seller_email,
        fields.property_address,
        fields.cash_offer_amount,
        fields.cash_closing_timeframe,
        fields.concierge_offer_amount,
        fields.concierge_closing_timeframe,
        fields.email_subject,
        fields.email_body,
        err.message,
        JSON.stringify(fields),
      ]
    );

    return res.render("offer-letter-form", {
      error: `Could not send: ${err.message}`,
      formValues: fields,
      userName: req.session.userName,
      emailConfigured: isEmailConfigured(),
    });
  }
});

// Re-generates the exact proposal PDF that was attached to a past offer
// letter, from its saved form_data - nothing is stored on disk, so this is
// rebuilt on demand the same way a signed agreement's PDF is re-fetched
// fresh rather than cached (see routes/agreements.js download route).
router.get("/offer-letters/:id/download", async (req, res, next) => {
  try {
    const result = await db.query(`SELECT * FROM offer_letters WHERE id = $1`, [req.params.id]);
    const letter = result.rows[0];
    if (!letter) return res.status(404).send("Offer letter not found.");

    const fields = letter.form_data || {};
    const pdfBuffer = await generateOfferLetterPdf({
      sellerName: fields.seller_name || letter.seller_name,
      propertyAddress: fields.property_address || letter.property_address,
      cashOfferAmount: fields.cash_offer_amount || letter.cash_offer_amount,
      cashClosingTimeframe: fields.cash_closing_timeframe || letter.cash_closing_timeframe,
      conciergeOfferAmount: fields.concierge_offer_amount || letter.concierge_offer_amount,
      conciergeClosingTimeframe: fields.concierge_closing_timeframe || letter.concierge_closing_timeframe,
      signerName: fields.signer_name,
      signerTitle: fields.signer_title,
      additionalNotes: fields.additional_notes,
    });

    const filename = `Property_Purchase_Proposal_${(letter.property_address || "proposal").replace(/[^a-z0-9]+/gi, "_")}.pdf`;
    res.set("Content-Type", "application/pdf");
    res.set("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(pdfBuffer);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
