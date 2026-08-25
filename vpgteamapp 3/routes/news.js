const express = require("express");
const db = require("../db/db");

const router = express.Router();

// Friendly labels for the categories the daily curation job tags each
// story with - see the "Business News" section of the project notes for
// exactly what counts as in-scope for each one. "new_employer" is
// specifically a company relocating or expanding into the area (e.g. a
// Facebook/Meta data center, a manufacturer opening a plant) - NOT general
// job-market/employment statistics, and not job listings.
const CATEGORY_LABELS = {
  real_estate: "Real Estate",
  development: "Development",
  new_employer: "New Employer",
  starbucks: "New Starbucks",
  growth: "Growth",
};

router.get("/news", async (req, res, next) => {
  try {
    // Stories from the last 45 days, freshest first within each city. The
    // daily curation job also prunes anything older than that, so this
    // cutoff is mostly a safety net.
    const result = await db.query(
      `SELECT * FROM business_news
       WHERE created_at > now() - interval '45 days'
       ORDER BY city, state, COALESCE(published_at, created_at::date) DESC, created_at DESC`
    );

    const byCity = [];
    const cityIndex = {};
    result.rows.forEach((story) => {
      const key = `${story.city}, ${story.state}`;
      if (!(key in cityIndex)) {
        cityIndex[key] = byCity.length;
        byCity.push({ city: story.city, state: story.state, stories: [] });
      }
      byCity[cityIndex[key]].stories.push(story);
    });
    // Cities with the most recent news first (each city's list is already
    // sorted newest-first, so just compare each group's first story).
    byCity.sort((a, b) => {
      const aDate = a.stories[0] ? new Date(a.stories[0].published_at || a.stories[0].created_at) : 0;
      const bDate = b.stories[0] ? new Date(b.stories[0].published_at || b.stories[0].created_at) : 0;
      return bDate - aDate;
    });

    const lastUpdatedResult = await db.query(`SELECT MAX(created_at) AS last_updated FROM business_news`);

    res.render("news", {
      userName: req.session.userName,
      byCity,
      categoryLabels: CATEGORY_LABELS,
      lastUpdated: lastUpdatedResult.rows[0].last_updated,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
