const axios = require("axios");
const FormData = require("form-data");
const { getType } = require("../config/agreementTypes");
const { generateAgreementPdf } = require("./pdfGenerator");
const { flattenSigners } = require("./signerUtils");
const { formatPropertyAddress } = require("./addressUtils");

const HELLOSIGN_API_BASE = "https://api.hellosign.com/v3";

/**
 * Sends an agreement for signature.
 *
 * If HELLOSIGN_API_KEY is not set, runs in MOCK mode: it still generates the
 * PDF (so you can sanity-check the document) but does not call the HelloSign
 * API, and returns a fake request id. This lets your team test the full
 * flow before your HelloSign templates/API key are ready.
 *
 * Once you have real HelloSign templates set up, you can switch this to call
 * `signature_request/send_with_template` instead of the file-based
 * `signature_request/send` used here - the signer/field structure below will
 * still apply.
 */
async function sendAgreementForSignature({ type, fields, signers, sentByName }) {
  const typeDef = getType(type);
  if (!typeDef) throw new Error(`Unknown agreement type: ${type}`);

  const pdfBuffer = await generateAgreementPdf({ type, fields, signers });

  const apiKey = process.env.HELLOSIGN_API_KEY;

  if (!apiKey) {
    return {
      mode: "mock",
      status: "mock_sent",
      requestId: `mock-${Date.now()}`,
      pdfBuffer,
    };
  }

  // What signers see as the request title/email subject: the full property
  // address (street, city, state, ZIP - built from those separate form
  // fields) followed by "Agreement" (e.g. "123 Main Street, Cleveland, OH
  // 44112 Agreement"), rather than leading with the internal document type
  // name.
  const propertyAddress = formatPropertyAddress(fields);
  const displayName = propertyAddress ? `${propertyAddress} Agreement` : typeDef.label;

  const form = new FormData();
  form.append("title", displayName);
  form.append("subject", displayName);
  form.append(
    "message",
    `Please review and sign this agreement for ${propertyAddress || "the property"}. Sent via VPGteamapp by ${sentByName || "the VPG team"}.`
  );

  // Built from the same flattened, ordered list of signers used to write the
  // PDF's [sig|req|signerN] text tags (services/pdfGenerator.js /
  // services/signerUtils.js), so a role with multiple people on it (e.g. two
  // Sellers) always lines up 1:1 with the text tag in the document: tag
  // signerN corresponds to signers[N-1] here.
  const flat = flattenSigners(typeDef, signers);
  flat.forEach((entry, i) => {
    form.append(`signers[${i}][email_address]`, entry.email || "");
    form.append(`signers[${i}][name]`, entry.name || "");
  });

  if (process.env.HELLOSIGN_TEST_MODE === "true") {
    form.append("test_mode", "1");
  }

  // The generated PDF embeds HelloSign "text tags" (e.g. [sig|req|signer1])
  // at each signature/date line so HelloSign auto-places the right field for
  // the right signer - no manual field placement needed.
  form.append("use_text_tags", "1");

  form.append("file[0]", pdfBuffer, {
    filename: `${typeDef.label.replace(/\s+/g, "_")}.pdf`,
    contentType: "application/pdf",
  });

  try {
    const response = await axios.post(`${HELLOSIGN_API_BASE}/signature_request/send`, form, {
      headers: form.getHeaders(),
      auth: { username: apiKey, password: "" },
    });

    const requestId = response.data?.signature_request?.signature_request_id || null;

    return {
      mode: "live",
      status: "sent",
      requestId,
      pdfBuffer,
    };
  } catch (err) {
    const message =
      err.response?.data?.error?.error_msg || err.message || "Unknown HelloSign error";
    const error = new Error(message);
    error.pdfBuffer = pdfBuffer;
    throw error;
  }
}

/**
 * Downloads the final signed PDF for a completed signature request, for the
 * dashboard's "Download" button. Always fetched fresh from HelloSign rather
 * than stored locally, so it's always the real, current, fully-executed
 * document (with HelloSign's signature/audit trail embedded) instead of a
 * copy the app has to keep in sync.
 */
async function downloadSignedPdf(requestId) {
  const apiKey = process.env.HELLOSIGN_API_KEY;
  if (!apiKey) throw new Error("HELLOSIGN_API_KEY is not configured");

  const response = await axios.get(`${HELLOSIGN_API_BASE}/signature_request/files/${requestId}`, {
    params: { file_type: "pdf" },
    auth: { username: apiKey, password: "" },
    responseType: "arraybuffer",
  });

  return Buffer.from(response.data);
}

/**
 * Checks HelloSign directly for whether a signature request is fully
 * signed or declined. This is a fallback/complement to the webhook
 * (routes/webhooks.js): the webhook updates status the moment HelloSign
 * calls back, but that requires the Event Callback URL to actually be set
 * in the HelloSign account first - this lets the dashboard reconcile
 * status on its own by asking HelloSign directly, so it shows the truth
 * even before that one-time setup step is done (or if a callback is ever
 * missed).
 */
async function checkSignatureRequestStatus(requestId) {
  const apiKey = process.env.HELLOSIGN_API_KEY;
  if (!apiKey) return null;

  const response = await axios.get(`${HELLOSIGN_API_BASE}/signature_request/${requestId}`, {
    auth: { username: apiKey, password: "" },
  });

  const sr = response.data?.signature_request;
  if (!sr) return null;

  if (sr.is_complete) return "signed";
  if ((sr.signatures || []).some((s) => s.status_code === "declined")) return "declined";
  return "sent";
}

/**
 * Nudges whoever hasn't signed yet on an existing signature request, for
 * the dashboard's "Resend" button on a Recent Activity row - useful when a
 * signer missed the original email or it landed in spam. This doesn't
 * generate a new document or a new signature request; it uses HelloSign's
 * own reminder endpoint (POST /signature_request/remind/:id, one call per
 * pending signer's email - the API reminds one signer at a time).
 *
 * Throws with a message safe to show the sender directly if: mock mode
 * (no API key), the request can't be found, everyone has already signed
 * or declined, or HelloSign itself rejects the reminder (e.g. its "no more
 * than one reminder per hour" cooldown).
 */
async function remindSignatureRequest(requestId) {
  const apiKey = process.env.HELLOSIGN_API_KEY;
  if (!apiKey) {
    throw new Error("HELLOSIGN_API_KEY is not configured, so resending isn't available in mock mode.");
  }

  let sr;
  try {
    const statusResponse = await axios.get(`${HELLOSIGN_API_BASE}/signature_request/${requestId}`, {
      auth: { username: apiKey, password: "" },
    });
    sr = statusResponse.data?.signature_request;
  } catch (err) {
    throw new Error(
      err.response?.data?.error?.error_msg || err.message || "Could not look up this signature request on HelloSign."
    );
  }
  if (!sr) throw new Error("Could not find this signature request on HelloSign.");

  const pendingSigners = (sr.signatures || []).filter(
    (s) => s.status_code !== "signed" && s.status_code !== "declined"
  );
  if (pendingSigners.length === 0) {
    throw new Error("Everyone has already signed (or declined) - there's no one left to remind.");
  }

  for (const signer of pendingSigners) {
    try {
      const form = new FormData();
      form.append("email_address", signer.signer_email_address);
      await axios.post(`${HELLOSIGN_API_BASE}/signature_request/remind/${requestId}`, form, {
        headers: form.getHeaders(),
        auth: { username: apiKey, password: "" },
      });
    } catch (err) {
      throw new Error(
        err.response?.data?.error?.error_msg || err.message || "Could not send the reminder."
      );
    }
  }

  return { remindedCount: pendingSigners.length };
}

module.exports = {
  sendAgreementForSignature,
  downloadSignedPdf,
  checkSignatureRequestStatus,
  remindSignatureRequest,
};
