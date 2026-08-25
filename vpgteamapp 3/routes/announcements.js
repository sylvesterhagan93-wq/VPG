const express = require("express");
const db = require("../db/db");
const requireAdmin = require("../middleware/requireAdmin");

const router = express.Router();

// Posting and deleting are admin-only (matches the pattern used for deal
// deletion and team-member removal elsewhere in the app) - announcements
// are a broadcast from leadership, not something any team member posts.
// Reading them happens as part of the dashboard route (routes/agreements.js),
// not here - this file only handles the write side.
router.post("/announcements", requireAdmin, async (req, res, next) => {
  const body = (req.body.body || "").trim();
  if (!body) {
    return res.redirect("/dashboard");
  }

  try {
    await db.query("INSERT INTO announcements (body, created_by_user_id) VALUES ($1, $2)", [
      body,
      req.session.userId,
    ]);
    res.redirect("/dashboard");
  } catch (err) {
    next(err);
  }
});

router.post("/announcements/:id/delete", requireAdmin, async (req, res, next) => {
  try {
    await db.query("DELETE FROM announcements WHERE id = $1", [req.params.id]);
    res.redirect("/dashboard");
  } catch (err) {
    next(err);
  }
});

module.exports = router;
