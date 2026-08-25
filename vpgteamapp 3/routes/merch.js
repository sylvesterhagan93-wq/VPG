const express = require("express");
const { MERCH_ITEMS } = require("../config/merchItems");

const router = express.Router();

router.get("/merch", (req, res) => {
  res.render("merch", {
    userName: req.session.userName,
    items: MERCH_ITEMS,
  });
});

module.exports = router;
