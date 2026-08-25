const express = require("express");
const crypto = require("crypto");
const multer = require("multer");
const db = require("../db/db");

const router = express.Router();

// HelloSign posts its event callback as multipart/form-data with a single
// text field named "json" (no file uploads involved) - multer's .none()
// parses text-only multipart bodies without needing a disk/memory storage
// config for files.
const upload = multer().none();

/**
 * Verifies that a HelloSign event callback actually came from HelloSign, not
 * someone guessing the callback URL: HelloSign signs every event with
 * HMAC-SHA256 of (event_time + event_type) using your API key as the
 * secret, and includes the result as event_hash. Recomputing and comparing
 * it (in constant time) is how HelloSign's own docs say to authenticate
 * callbacks - there's no separate signing secret to configure.
 */
function isValidHelloSignEvent(event, apiKey) {
  if (!apiKey || !event || !event.event_hash || !event.event_time || !event.event_type) {
    return false;
  }
  const expected = crypto
    .createHmac("sha256", apiKey)
    .update(String(event.event_time) + String(event.event_type))
    .digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(String(event.event_hash), "utf8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// HelloSign requires every callback response to be a 200 with this exact
// text in the body, or it treats the callback as failing and keeps retrying
// (and eventually flags the callback URL as broken in your account).
const ACK = "Hello API Event Received";

router.post("/webhooks/hellosign", upload, async (req, res) => {
  // Always acknowledge - HelloSign's retry behavior on non-200/non-ACK
  // responses can otherwise flood the endpoint, and any real problem here
  // is something to see in the server logs, not something HelloSign retrying
  // will fix.
  res.set("Content-Type", "text/plain");

  let payload;
  try {
    payload = JSON.parse(req.body.json);
  } catch (err) {
    console.error("HelloSign webhook: could not parse payload", err);
    return res.status(200).send(ACK);
  }

  const event = payload.event;
  const apiKey = process.env.HELLOSIGN_API_KEY;

  if (!isValidHelloSignEvent(event, apiKey)) {
    console.error("HelloSign webhook: event_hash did not match - ignoring (possibly spoofed or misconfigured key)");
    return res.status(200).send(ACK);
  }

  const eventType = event.event_type;
  const requestId = payload.signature_request?.signature_request_id;

  try {
    if (eventType === "signature_request_all_signed" && requestId) {
      await db.query(
        `UPDATE agreements SET status = 'signed', signed_at = now() WHERE hellosign_request_id = $1`,
        [requestId]
      );
    } else if (eventType === "signature_request_declined" && requestId) {
      await db.query(
        `UPDATE agreements SET status = 'declined' WHERE hellosign_request_id = $1`,
        [requestId]
      );
    }
    // Other event types (sent, viewed, an individual signer signing before
    // everyone has, reminders, etc.) don't change what the dashboard shows -
    // the dashboard only distinguishes "sent" from "fully signed".
  } catch (err) {
    console.error("HelloSign webhook: failed to update agreement status", err);
  }

  return res.status(200).send(ACK);
});

module.exports = router;
