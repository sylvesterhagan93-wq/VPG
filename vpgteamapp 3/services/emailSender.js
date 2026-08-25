const nodemailer = require("nodemailer");
const dns = require("dns");

const dnsPromises = dns.promises;
const GMAIL_SMTP_HOST = "smtp.gmail.com";
const GMAIL_SMTP_PORT = 465;

// Offer Letters are sent as a plain email (not a HelloSign signature
// request) from Sylvester's own Gmail account, so sellers see it come from
// a real person at sylvesterhagan93@gmail.com rather than a generic
// no-reply address. Gmail requires an "App Password" (a 16-character code
// generated in the Google Account's Security settings, separate from the
// real account password) for SMTP sign-in like this - a real password
// won't work here even if entered.
//
// If GMAIL_USER/GMAIL_APP_PASSWORD aren't set yet, this runs in MOCK mode
// (mirrors services/hellosign.js's HELLOSIGN_API_KEY mock-mode pattern):
// the PDF still gets generated so the team can see exactly what would be
// sent, but no real email goes out.
function isEmailConfigured() {
  return !!(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
}

// Render's outbound network doesn't route IPv6, but smtp.gmail.com has both
// A (IPv4) and AAAA (IPv6) records, and Node kept picking an IPv6 address
// and failing instantly with ENETUNREACH.
//
// IMPORTANT: an earlier version of this fix monkey-patched the global
// dns.lookup() to always force IPv4 for the whole process. That broke
// logins - Supabase's direct Postgres connection host is IPv6-ONLY, so
// forcing every DNS lookup in the app to IPv4 made the database
// unreachable. Never patch DNS globally again here; this resolves Gmail's
// address ourselves, scoped to just this SMTP connection, and connects to
// that IP directly (keeping `servername` set to the real hostname so TLS
// certificate validation still passes).
async function resolveGmailIPv4() {
  try {
    const addresses = await dnsPromises.resolve4(GMAIL_SMTP_HOST);
    return addresses[0] || null;
  } catch (err) {
    return null; // fall back to the hostname below and let nodemailer try
  }
}

async function buildTransporter() {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) return null;

  const ipv4Address = await resolveGmailIPv4();

  return nodemailer.createTransport({
    host: ipv4Address || GMAIL_SMTP_HOST,
    port: GMAIL_SMTP_PORT,
    secure: true,
    tls: { servername: GMAIL_SMTP_HOST },
    auth: { user, pass },
  });
}

/**
 * Sends the Offer Letter email with the generated proposal PDF attached.
 *
 * { to, subject, body, pdfBuffer, filename, senderName } ->
 *   { mode: "live" | "mock", messageId }
 */
async function sendOfferLetterEmail({ to, subject, body, pdfBuffer, filename, senderName }) {
  const transporter = await buildTransporter();

  if (!transporter) {
    return { mode: "mock", messageId: `mock-${Date.now()}` };
  }

  const fromAddress = process.env.GMAIL_USER;
  const fromName = senderName ? `${senderName} - Venture Property Group` : "Venture Property Group";

  try {
    const info = await transporter.sendMail({
      from: `"${fromName}" <${fromAddress}>`,
      to,
      subject,
      text: body,
      attachments: [
        {
          filename: filename || "Property_Purchase_Proposal.pdf",
          content: pdfBuffer,
          contentType: "application/pdf",
        },
      ],
    });
    return { mode: "live", messageId: info.messageId };
  } catch (err) {
    const message =
      err.response || err.message || "Unknown error sending email through Gmail.";
    throw new Error(message);
  }
}

module.exports = { sendOfferLetterEmail, isEmailConfigured };
