// Shared helpers for dealing with signers, including roles that can have
// more than one person (e.g. multiple Sellers on a Purchase/Novation
// Agreement, or multiple Assignees on an Assignment Agreement). Used by both
// routes/agreements.js (to parse the submitted form) and
// services/pdfGenerator.js + services/hellosign.js (so the PDF's HelloSign
// text tags and the actual HelloSign API signers[] array always line up -
// both are built by walking the same flattened list, in the same order).

/**
 * Turns the raw POST body values for a "multiple" signer role into a clean
 * array of { name, email }, dropping fully-empty rows. `rawNames`/
 * `rawEmails` come straight from req.body for a `name="...[]"` field, which
 * express (with extended:true urlencoded parsing) gives back as a single
 * string when there was one row, or an array when there were several.
 */
function normalizeMultiEntries(rawNames, rawEmails) {
  const names = Array.isArray(rawNames) ? rawNames : rawNames !== undefined ? [rawNames] : [];
  const emails = Array.isArray(rawEmails) ? rawEmails : rawEmails !== undefined ? [rawEmails] : [];
  const len = Math.max(names.length, emails.length);
  const out = [];
  for (let i = 0; i < len; i++) {
    const name = (names[i] || "").trim();
    const email = (emails[i] || "").trim();
    if (name || email) out.push({ name, email });
  }
  return out;
}

/**
 * Walks typeDef.signers in order and produces one flat, ordered list of
 * every actual signer on the document - expanding "multiple" roles (e.g.
 * two Sellers) into one entry per person. Each entry's position (1-based)
 * is its HelloSign text-tag number (`signer1`, `signer2`, ...), which also
 * lines up 1:1 with the HelloSign API `signers[]` array index (tag N =
 * signers[N-1]) - see services/hellosign.js.
 */
function flattenSigners(typeDef, signers) {
  const flat = [];
  typeDef.signers.forEach((s) => {
    if (s.multiple) {
      const entries = Array.isArray(signers[s.key]) ? signers[s.key] : [];
      entries.forEach((entry) => {
        if (entry && entry.name && entry.email) {
          flat.push({ roleKey: s.key, name: entry.name, email: entry.email });
        }
      });
    } else if (signers[s.key] && (signers[s.key].name || signers[s.key].email)) {
      flat.push({ roleKey: s.key, name: signers[s.key].name, email: signers[s.key].email });
    }
  });
  flat.forEach((entry, i) => {
    entry.tag = `signer${i + 1}`;
  });
  return flat;
}

function entriesForRole(flat, roleKey) {
  return flat.filter((e) => e.roleKey === roleKey);
}

function namesForRole(flat, roleKey) {
  return entriesForRole(flat, roleKey).map((e) => e.name);
}

/**
 * Joins a list of names the way a contract would: "Alice", "Alice and Bob",
 * or "Alice, Bob, and Carol".
 */
function joinNames(names) {
  const valid = (names || []).filter(Boolean);
  if (valid.length === 0) return "____________________";
  if (valid.length === 1) return valid[0];
  if (valid.length === 2) return `${valid[0]} and ${valid[1]}`;
  return `${valid.slice(0, -1).join(", ")}, and ${valid[valid.length - 1]}`;
}

module.exports = { normalizeMultiEntries, flattenSigners, entriesForRole, namesForRole, joinNames };
