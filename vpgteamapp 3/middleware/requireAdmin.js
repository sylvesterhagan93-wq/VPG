module.exports = function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) {
    return next();
  }
  return res.status(403).send("Only a team admin can do that.");
};
