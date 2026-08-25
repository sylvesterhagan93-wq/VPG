# VPGteamapp

An internal tool for the VPG team to log in and send four kinds of agreements
out for e-signature via HelloSign (Dropbox Sign): **Purchase Agreements**,
**Novation Agreements**, **Assignment Agreements**, and **Addendums**.

Someone on the team logs in, picks a document type, fills in the parties and
deal details, clicks Send — the app generates the agreement as a PDF and
sends it through HelloSign for signature. Every send is logged on the
dashboard so the team can see what's gone out, to whom, and its status.

## What's in this build (prototype stage)

This is a fully working prototype, not a mockup — the login, forms, PDF
generation, and database logging are all real. The one thing not live yet is
the actual HelloSign send:

- **Without a HelloSign API key** (the default right now): the app runs in
  **mock mode**. It still generates the real agreement PDF and logs the send
  on the dashboard as "mock sent" — so your team can test the entire flow —
  but it doesn't call HelloSign.
- **Once you add your HelloSign API key** (see below), sends go out for
  real. The app builds the exact agreement text as a PDF from the form
  fields (not a HelloSign template) and sends it using HelloSign's "text
  tags" feature (`[sig|req|signer1]`, `[da|req|signer1]`, etc., embedded at
  each signature line) so HelloSign automatically places the right
  signature and date field for the right signer — no manual field
  placement or a pre-built HelloSign template required. This hasn't been
  tested against a real HelloSign account yet since I don't have your API
  key — the first real send is worth double-checking that the fields land
  where expected.
- **Purchase Agreement**, **Assignment Agreement**, and **Novation
  Agreement** are built from the actual documents you use today
  (word-for-word contract language, with your form answers dropped into
  the blanks). **Addendum** is still a generic placeholder layout — send
  me that real document the same way and I'll match it too.

## Running it locally

The app now stores its data in Postgres (Supabase) instead of a local
SQLite file, so you'll need a `DATABASE_URL` before it can start:

```
npm install
cp .env.example .env    # fill in DATABASE_URL (from Supabase) and other values
npm run seed             # creates one login: admin@vpgteamapp.com / ChangeMe123! (only if no admin exists yet)
npm start
```

Then visit `http://localhost:3000` and log in with the seeded account (or,
on the live site, your real admin login). From there, add the rest of the
team from the in-app **Team** tab — see "Managing your team" below.

## Connecting your real HelloSign account

1. Get your API key from HelloSign/Dropbox Sign: Account Settings → API.
2. Put it in `.env` as `HELLOSIGN_API_KEY=...`.
3. Restart the app. The "mock mode" banner disappears and sends go out for
   real.
4. Optional: set `HELLOSIGN_TEST_MODE=true` in `.env` while you're testing
   with the real API — HelloSign accepts real-looking requests but doesn't
   count them against your account or require signers to actually sign.

## Managing your team

Once logged in, there's a **Team** tab in the top nav for everyone on the
team, and it doubles as a lightweight KPI dashboard:

- Every team member sees the full roster with each person's status
  (Active / Invited / Deactivated), how many agreements they've sent
  **this week**, and how many they've sent all-time — so you can see at a
  glance who's actively sending deals.
- **Only the admin account** (you) sees the "Add Team Member" box and the
  Remove/Reactivate buttons — everyone else gets a read-only view of the
  roster.

**Adding a teammate:** On the Team page, enter their name and email and
click **Generate Invite Link**. This doesn't send an email automatically —
it hands you back a one-time signup link that you send however you like
(text, Slack, email). The link is valid for 7 days and lets them set their
own name and password to activate the account. Until they use it, they show
up in the roster with an "Invited" badge.

**Removing a teammate:** Click **Remove** next to their name (you'll be
asked to confirm). If they'd already sent agreements, their account is
deactivated rather than deleted, so the send history stays intact and
attributed to them — they just can no longer log in. You can bring a
deactivated account back at any time with **Reactivate**. An invite that
was never accepted is deleted outright when removed, since there's no
history tied to it yet.

You can't remove or deactivate your own admin account from the Team page.

The very first admin login (yours) was created directly in the database
when this was set up — there's no separate step needed for that.

## The four document types and their fields

Everything about each document type — its signer roles, its form fields, and
(for Purchase, Assignment, and Novation) the actual contract text — lives in
`config/agreementTypes.js` and `services/pdfGenerator.js`. Current fields
per type:

Purchase, Novation, and Assignment each have their own **"Escrow / Title
Company"** section on the form, since you use a different title company deal
to deal — company name (required), contact person, phone, email, and
address. Fill in whatever you have; anything left blank just prints as a
blank line in the PDF.

- **Purchase Agreement** (matches your real template) — Seller(s); a Buyer
  Representative who signs on behalf of Venture Property Group, LLC
  (always the fixed Buyer entity); agreement date; property address;
  county/state; purchase price; non-refundable deposit; escrow/title
  company section; closing timeline; inspection period; additional terms.
- **Assignment Agreement** (matches your real template) — an Assignor
  Representative signing on behalf of Venture Property Group, LLC (always
  the fixed Assignor — VPG assigns its Buyer position from the Purchase
  Agreement to an end buyer); the Assignee (entity name, signer, title);
  agreement date; property address; original seller name and Purchase
  Agreement date; assignment consideration; assignment earnest money
  deposit; settlement date; escrow/title company section.
- **Novation Agreement** (matches your real template) — this one sends as
  a single 3-in-1 packet, exactly like your source document: the Ohio
  wholesale Purchase Agreement (with its Assignability & Novation clause),
  the Novation and Indemnification Agreement, and the Authorization to
  Sign / power of attorney — all signed by the same Seller and Buyer
  Representative. Fields: Seller(s); Buyer Representative / Managing
  Member; agreement date; property address; county (defaults state to
  Ohio, editable); purchase price; escrow deposit; escrow/title company
  section (pre-filled with American Title Solutions' info since that's
  who you've used before, but fully editable per deal); closing/inspection
  timelines; governing law state; seller net proceeds; additional terms.
- **Addendum** (placeholder, not yet matched to a real document) — Party
  1, Party 2, related agreement reference, property address, effective
  date, details of changes.

Send over your real Addendum document and I'll rebuild that one the same
way Purchase, Assignment, and Novation were built — matching the actual
contract language, not just a generic field summary.

## Project structure

```
server.js                 entry point
config/agreementTypes.js  the 4 document types + their fields (edit this to change forms)
db/                        Postgres (Supabase) connection + seed script
middleware/                login-required + admin-only route guards
routes/                    auth (login/logout/invite signup) + agreement routes + team routes
services/
  pdfGenerator.js          builds the agreement PDF from form data
  hellosign.js             sends the PDF to HelloSign (or mocks it)
views/                     EJS templates (login, dashboard, form, confirmation, team, signup)
public/css/style.css       styling
public/images/             your logo + ocean background
```

## Going live (a real URL your team can use)

The database is already set up on Supabase (project `vpgteamapp`, in your
VPG organization) with the `users` and `agreements` tables created and one
login seeded.

Render (your connected hosting provider) deploys from a Git repository, so
the one remaining step is getting this code onto GitHub — there's no
GitHub connector available yet to do that step automatically. It's quick
without needing any command line:

1. Go to [github.com/new](https://github.com/new), name the repository
   (e.g. `vpgteamapp`), leave it **Public** (Render needs to be able to
   read it), don't add a README, and click **Create repository**.
2. On the next page, click **"uploading an existing file."**
3. Unzip the project folder I sent you, then drag the whole `vpgteamapp`
   folder into the upload area (modern browsers preserve the folder
   structure) — everything except `node_modules` (already excluded from
   the zip) and your local `.env` (never include real secrets in the
   repo).
4. Scroll down and click **Commit changes**.
5. Copy the repository URL from your browser's address bar (something like
   `https://github.com/yourname/vpgteamapp`) and send it back to me.

Once I have that URL, I'll create the Render web service pointed at it,
set `DATABASE_URL`, `SESSION_SECRET`, and `HELLOSIGN_API_KEY` as secure
environment variables on Render (never in the code), and hand you back a
live URL your team can bookmark.
