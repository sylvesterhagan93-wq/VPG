const express = require("express");
const db = require("../db/db");
const { AGREEMENT_TYPES, getType, VPG_PRINCIPAL } = require("../config/agreementTypes");
const { sendAgreementForSignature, downloadSignedPdf, checkSignatureRequestStatus } = require("../services/hellosign");
const { normalizeMultiEntries } = require("../services/signerUtils");
const { STATE_NAMES, COUNTIES_BY_STATE } = require("../config/usLocations");
const { TITLE_COMPANIES } = require("../config/titleCompanies");

const router = express.Router();

// For every "multiple" signer role (e.g. Seller, Assignee), builds the list
// of { name, email } rows the form should render - either what was already
// typed in (on a failed submit, so nothing is lost) or a single blank
// starter row (on a fresh form). Always at least one row so there's always
// something to fill in.
function buildMultiSignerEntries(typeDef, body) {
  const map = {};
  typeDef.signers.forEach((s) => {
    if (!s.multiple) return;
    const entries = body
      ? normalizeMultiEntries(body[`signer_${s.key}_name`], body[`signer_${s.key}_email`])
      : [];
    map[s.key] = entries.length > 0 ? entries : [{ name: "", email: "" }];
  });
  return map;
}

// Real signature requests get a request id from HelloSign; mock sends
// (no API key configured) get a "mock-<timestamp>" placeholder that was
// never actually sent, so there's nothing to check status on.
function isRealHelloSignRequest(requestId) {
  return !!requestId && !requestId.startsWith("mock-");
}

// Reconciles any "sent" agreement's status directly against HelloSign
// before the dashboard renders, so "signed" shows up immediately - this
// doesn't depend on the HelloSign Event Callback URL being configured
// (routes/webhooks.js handles that in real time when it is set up; this is
// the fallback/complement that makes the dashboard correct either way).
// Best-effort: a HelloSign hiccup here should never break the dashboard.
async function reconcilePendingStatuses() {
  if (!process.env.HELLOSIGN_API_KEY) return;

  try {
    const pending = await db.query(
      `SELECT id, hellosign_request_id FROM agreements WHERE status = 'sent'`
    );
    for (const row of pending.rows) {
      if (!isRealHelloSignRequest(row.hellosign_request_id)) continue;
      try {
        const status = await checkSignatureRequestStatus(row.hellosign_request_id);
        if (status === "signed") {
          await db.query(`UPDATE agreements SET status = 'signed', signed_at = now() WHERE id = $1`, [row.id]);
        } else if (status === "declined") {
          await db.query(`UPDATE agreements SET status = 'declined' WHERE id = $1`, [row.id]);
        }
      } catch (err) {
        console.error(`Could not check HelloSign status for agreement ${row.id}:`, err.message);
      }
    }
  } catch (err) {
    console.error("Could not load pending agreements to reconcile:", err.message);
  }
}

router.get("/dashboard", async (req, res, next) => {
  try {
    await reconcilePendingStatuses();

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

// Downloads the fully-executed PDF for an agreement once every signer has
// signed. HelloSign's callback (routes/webhooks.js) is what flips status to
// "signed" when that happens; this route just fetches the document fresh
// from HelloSign on click rather than storing a copy.
router.get("/agreements/:id/download", async (req, res, next) => {
  try {
    const result = await db.query(`SELECT * FROM agreements WHERE id = $1`, [req.params.id]);
    const agreement = result.rows[0];
    if (!agreement) return res.status(404).send("Agreement not found.");
    if (agreement.status !== "signed") {
      return res.status(400).send("This agreement hasn't been fully signed yet.");
    }
    if (!agreement.hellosign_request_id) {
      return res.status(400).send("No HelloSign request is associated with this agreement.");
    }

    const pdfBuffer = await downloadSignedPdf(agreement.hellosign_request_id);
    const filename = `${agreement.type}-${(agreement.property_address || "agreement").replace(/[^a-z0-9]+/gi, "_")}.pdf`;

    res.set("Content-Type", "application/pdf");
    res.set("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(pdfBuffer);
  } catch (err) {
    next(err);
  }
});

router.get("/agreements/new/:type", (req, res) => {
  const typeDef = getType(req.params.type);
  if (!typeDef) return res.status(404).send("Unknown agreement type");

  // The "signs on behalf of VPG" signer is always Sylvester - locked, not
  // editable, and not tied to whoever happens to be logged in.
  const formValues = {};
  typeDef.signers.forEach((s) => {
    if (s.internal) {
      formValues[`signer_${s.key}_name`] = VPG_PRINCIPAL.name;
      formValues[`signer_${s.key}_email`] = VPG_PRINCIPAL.email;
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
    multiSignerEntries: buildMultiSignerEntries(typeDef),
    userName: req.session.userName,
    vpgPrincipal: VPG_PRINCIPAL,
    stateNames: STATE_NAMES,
    countiesByState: COUNTIES_BY_STATE,
    titleCompanies: TITLE_COMPANIES,
  });
});

router.post("/agreements/new/:type", async (req, res) => {
  const typeDef = getType(req.params.type);
  if (!typeDef) return res.status(404).send("Unknown agreement type");

  const body = req.body;

  // Collect signer name/email pairs. The "signs on behalf of VPG" signer is
  // always forced to Sylvester here, regardless of what was submitted -
  // this is what actually enforces the lock (the form doesn't even render
  // editable inputs for it, but this is what stops someone from bypassing
  // that by posting to this route directly). "Multiple" roles (Seller,
  // Assignee) come back as an array of { name, email } - one per person.
  const signers = {};
  for (const s of typeDef.signers) {
    if (s.internal) {
      signers[s.key] = { name: VPG_PRINCIPAL.name, email: VPG_PRINCIPAL.email };
    } else if (s.multiple) {
      signers[s.key] = normalizeMultiEntries(body[`signer_${s.key}_name`], body[`signer_${s.key}_email`]);
    } else {
      signers[s.key] = {
        name: (body[`signer_${s.key}_name`] || "").trim(),
        email: (body[`signer_${s.key}_email`] || "").trim(),
      };
    }
  }

  // Collect the rest of the fields
  const fields = {};
  for (const f of typeDef.fields) {
    fields[f.key] = (body[f.key] || "").trim();
  }

  // Basic required-field validation
  const missing = [];
  typeDef.signers.forEach((s) => {
    if (s.internal) return;
    if (s.multiple) {
      const entries = signers[s.key] || [];
      const complete = entries.filter((e) => e.name && e.email);
      if (complete.length === 0) {
        missing.push(`${s.label} (at least one)`);
      } else if (complete.length !== entries.length) {
        missing.push(`${s.label} - each row needs both a name and an email`);
      }
    } else {
      if (!signers[s.key].name) missing.push(`${s.label} name`);
      if (!signers[s.key].email) missing.push(`${s.label} email`);
    }
  });
  typeDef.fields.forEach((f) => {
    if (f.required && !fields[f.key]) missing.push(f.label);
  });

  if (missing.length > 0) {
    return res.render("agreement-form", {
      typeDef,
      error: `Please fill in: ${missing.join(", ")}`,
      formValues: body,
      multiSignerEntries: buildMultiSignerEntries(typeDef, body),
      userName: req.session.userName,
      vpgPrincipal: VPG_PRINCIPAL,
      stateNames: STATE_NAMES,
      countiesByState: COUNTIES_BY_STATE,
      titleCompanies: TITLE_COMPANIES,
    });
  }

  const partySummary = typeDef.signers
    .map((s) => {
      if (s.multiple) {
        return (signers[s.key] || []).filter((e) => e.name).map((e) => e.name).join(", ");
      }
      return signers[s.key].name;
    })
    .filter(Boolean)
    .join(" & ");

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
      multiSignerEntries: buildMultiSignerEntries(typeDef, body),
      userName: req.session.userName,
      vpgPrincipal: VPG_PRINCIPAL,
      stateNames: STATE_NAMES,
      countiesByState: COUNTIES_BY_STATE,
      titleCompanies: TITLE_COMPANIES,
    });
  }
});

module.exports = router;
