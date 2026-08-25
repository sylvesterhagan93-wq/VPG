const nodemailer = require("nodemailer");
const dns = require("dns");

// Render's network doesn't route outbound IPv6, but Node's DNS resolver
// will still hand back an IPv6 address for smtp.gmail.com first on some
// hosts, which fails immediately with ECONNREFUSED/ENETUNREACH before ever
// trying the IPv4 address. Forcing IPv4-first resolution avoids that.
if (typeof dns.setDefaultResultOrder === "function") {
  dns.setDefaultResultOrder("ipv4first");
}

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
let cachedTransporter = null;
function getTransporter() {
  if (cachedTransporter) return cachedTransporter;
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) return null;

  cachedTransporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass },
    // Belt-and-suspenders alongside the dns.setDefaultResultOrder() above:
    // force the actual socket connection to IPv4 so this can't regress if
    // something upstream (nodemailer, Node itself) ever changes its lookup
    // behavior again.
    family: 4,
  });
  return cachedTransporter;
}

function isEmailConfigured() {
  return !!(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
}

/**
 * Sends the Offer Letter email with the generated proposal PDF attached.
 *
 * { to, subject, body, pdfBuffer, filename, senderName } ->
 *   { mode: "live" | "mock", messageId }
 */
async function sendOfferLetterEmail({ to, subject, body, pdfBuffer, filename, senderName }) {
  const transporter = getTransporter();

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
