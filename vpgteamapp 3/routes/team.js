const express = require("express");
const crypto = require("crypto");
const db = require("../db/db");
const requireAdmin = require("../middleware/requireAdmin");

const router = express.Router();

const INVITE_EXPIRY_DAYS = 7;

router.get("/team", async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT
         users.id,
         users.name,
         users.email,
         users.is_admin,
         users.status,
         users.invite_token,
         COUNT(agreements.id) FILTER (
           WHERE agreements.created_at >= date_trunc('week', now())
         ) AS sent_this_week,
         COUNT(agreements.id) AS sent_all_time
       FROM users
       LEFT JOIN agreements ON agreements.sent_by_user_id = users.id
       GROUP BY users.id
       ORDER BY sent_this_week DESC, users.name ASC`
    );

    res.render("team", {
      userName: req.session.userName,
      isAdmin: req.session.isAdmin,
      members: result.rows,
      currentUserId: req.session.userId,
      newInviteLink: req.session.newInviteLink || null,
      error: req.session.teamError || null,
    });

    // one-time flash values
    delete req.session.newInviteLink;
    delete req.session.teamError;
  } catch (err) {
    next(err);
  }
});

router.post("/team/invite", requireAdmin, async (req, res, next) => {
  const { name, email } = req.body;

  if (!name || !name.trim() || !email || !email.trim()) {
    req.session.teamError = "Please enter both a name and an email.";
    return res.redirect("/team");
  }

  const cleanEmail = email.trim().toLowerCase();

  try {
    const existing = await db.query("SELECT id, status FROM users WHERE email = $1", [cleanEmail]);
    if (existing.rows.length > 0) {
      req.session.teamError = `${cleanEmail} is already on the team (or already invited).`;
      return res.redirect("/team");
    }

    const token = crypto.randomBytes(24).toString("hex");
    const expiresAt = new Date(Date.now() + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

    await db.query(
      `INSERT INTO users (name, email, status, invite_token, invite_token_expires_at)
       VALUES ($1, $2, 'invited', $3, $4)`,
      [name.trim(), cleanEmail, token, expiresAt]
    );

    req.session.newInviteLink = `${req.protocol}://${req.get("host")}/signup/${token}`;
    res.redirect("/team");
  } catch (err) {
    next(err);
  }
});

router.post("/team/:id/remove", requireAdmin, async (req, res, next) => {
  const targetId = Number(req.params.id);

  if (targetId === req.session.userId) {
    req.session.teamError = "You can't remove your own account.";
    return res.redirect("/team");
  }

  try {
    const target = await db.query("SELECT status FROM users WHERE id = $1", [targetId]);
    if (target.rows.length === 0) {
      return res.redirect("/team");
    }

    if (target.rows[0].status === "invited") {
      // Invite never activated - safe to remove outright, no agreements can reference it.
      await db.query("DELETE FROM users WHERE id = $1", [targetId]);
    } else {
      // Active member - deactivate rather than delete, so their sent-agreement history
      // stays attributed to them. Deactivated accounts can no longer log in.
      await db.query("UPDATE users SET status = 'deactivated' WHERE id = $1", [targetId]);
    }

    res.redirect("/team");
  } catch (err) {
    next(err);
  }
});

router.post("/team/:id/reactivate", requireAdmin, async (req, res, next) => {
  try {
    await db.query("UPDATE users SET status = 'active' WHERE id = $1 AND status = 'deactivated'", [
      req.params.id,
    ]);
    res.redirect("/team");
  } catch (err) {
    next(err);
  }
});

module.exports = router;
