require("dotenv").config();
const express = require("express");
const session = require("express-session");
const path = require("path");

const requireAuth = require("./middleware/requireAuth");
const authRoutes = require("./routes/auth");
const agreementRoutes = require("./routes/agreements");
const teamRoutes = require("./routes/team");
const dealRoutes = require("./routes/deals");
const newsRoutes = require("./routes/news");
const merchRoutes = require("./routes/merch");
const webhookRoutes = require("./routes/webhooks");

require("./db/db"); // Postgres (Supabase) connection pool - schema is managed via migrations, not created here

const app = express();
const PORT = process.env.PORT || 3000;

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.use(
  session({
    secret: process.env.SESSION_SECRET || "dev_secret_change_me",
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 8 }, // 8 hours
  })
);

app.get("/", (req, res) => {
  res.redirect(req.session.userId ? "/dashboard" : "/login");
});

// HelloSign calls this directly (not the team's browser), so it's
// intentionally outside requireAuth - it's authenticated a different way,
// by verifying HelloSign's event_hash signature (see routes/webhooks.js).
app.use(webhookRoutes);

app.use(authRoutes);
app.use(requireAuth, agreementRoutes);
app.use(requireAuth, dealRoutes);
app.use(requireAuth, newsRoutes);
app.use(requireAuth, merchRoutes);
app.use(requireAuth, teamRoutes);

app.use((req, res) => {
  res.status(404).send("Page not found.");
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).send("Something went wrong. Please try again, and let the team know if it keeps happening.");
});

app.listen(PORT, () => {
  console.log(`VPGteamapp running on http://localhost:${PORT}`);
  if (!process.env.HELLOSIGN_API_KEY) {
    console.log("HELLOSIGN_API_KEY not set - running in MOCK send mode.");
  }
});
