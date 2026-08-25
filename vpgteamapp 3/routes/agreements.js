const express = require("express");
const db = require("../db/db");
const { AGREEMENT_TYPES, getType } = require("../config/agreementTypes");
const { sendAgreementForSignature } = require("../services/hellosign");

const router = express.Router();

router.get("/dashboard", async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT agreements.*, users.name AS sent_by_name
       FROM agreements
       JOIN users ON users.id = agreements.sent_by_user_id
       ORDER BY agreements.created_at DESC
       LIMIT 25`
    );

    res.render("dashboard", {
      userName: req.session.userName,
      types: Object.values(AGREEMENT_TYPES),
      recent: result.rows,
    });
  } catch (err) {
    next(err);
  }
});

router.get("/agreements/new/:type", (req, res) => {
  const typeDef = getType(req.params.type);
  if (!typeDef) return res.status(404).send("Unknown agreement type");

  // Pre-fill the "signs on behalf of VPG" signer with whoever is logged in,
  // and default any agreement_date field to today - both stay editable.
  const formValues = {};
  typeDef.signers.forEach((s) => {
    if (s.internal) {
      formValues[`signer_${s.key}_name`] = req.session.userName || "";
      formValues[`signer_${s.key}_email`] = req.session.userEmail || "";
    }
  });
  if (typeDef.fields.some((f) => f.key === "agreement_date")) {
    formValues.agreement_date = new Date().toISOString().slice(0, 10);
  }
  typeDef.fields.forEach((f) => {
    if (f.default !== undefined && formValues[f.key] === undefined) {
      formValues[f.key] = f.default;
    }
  });

  res.render("agreement-form", {
    typeDef,
    error: null,
    formValues,
    userName: req.session.userName,
  });
});

router.post("/agreements/new/:type", async (req, res) => {
  const typeDef = getType(req.params.type);
  if (!typeDef) return res.status(404).send("Unknown agreement type");

  const body = req.body;

  // Collect signer name/email pairs
  const signers = {};
  for (const s of typeDef.signers) {
    signers[s.key] = {
      name: (body[`signer_${s.key}_name`] || "").trim(),
      email: (body[`signer_${s.key}_email`] || "").trim(),
    };
  }

  // Collect the rest of the fields
  const fields = {};
  for (const f of typeDef.fields) {
    fields[f.key] = (body[f.key] || "").trim();
  }

  // Basic required-field validation
  const missing = [];
  typeDef.signers.forEach((s) => {
    if (!signers[s.key].name) missing.push(`${s.label} name`);
    if (!signers[s.key].email) missing.push(`${s.label} email`);
  });
  typeDef.fields.forEach((f) => {
    if (f.required && !fields[f.key]) missing.push(f.label);
  });

  if (missing.length > 0) {
    return res.render("agreement-form", {
      typeDef,
      error: `Please fill in: ${missing.join(", ")}`,
      formValues: body,
      userName: req.session.userName,
    });
  }

  const partySummary = typeDef.signers.map((s) => signers[s.key].name).join(" & ");

  try {
    const result = await sendAgreementForSignature({
      type: typeDef.key,
      fields,
      signers,
      sentByName: req.session.userName,
    });

    await db.query(
      `INSERT INTO agreements
        (type, sent_by_user_id, party_summary, property_address, form_data, status, hellosign_request_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        typeDef.key,
        req.session.userId,
        partySummary,
        fields.property_address || null,
        JSON.stringify({ fields, signers }),
        result.status,
        result.requestId,
      ]
    );

    res.render("agreement-sent", { typeDef, result, partySummary, userName: req.session.userName });
  } catch (err) {
    await db.query(
      `INSERT INTO agreements
        (type, sent_by_user_id, party_summary, property_address, form_data, status, error_message)
       VALUES ($1, $2, $3, $4, $5, 'failed', $6)`,
      [
        typeDef.key,
        req.session.userId,
        partySummary,
        fields.property_address || null,
        JSON.stringify({ fields, signers }),
        err.message,
      ]
    );

    return res.render("agreement-form", {
      typeDef,
      error: `Could not send: ${err.message}`,
      formValues: body,
      userName: req.session.userName,
    });
  }
});

module.exports = router;
