// Seeds one initial team login so you can sign in on day one.
// Run with: npm run seed
// Change the email/password below (or add more users the same way) before deploying.

const bcrypt = require("bcryptjs");
const pool = require("./db");

const SEED_USERS = [
  {
    name: "VPG Admin",
    email: "admin@vpgteamapp.com",
    password: "ChangeMe123!",
  },
];

async function main() {
  for (const u of SEED_USERS) {
    const existing = await pool.query("SELECT id FROM users WHERE email = $1", [u.email]);
    if (existing.rows.length > 0) {
      console.log(`User ${u.email} already exists, skipping.`);
      continue;
    }
    const hash = bcrypt.hashSync(u.password, 10);
    await pool.query(
      "INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3)",
      [u.name, u.email, hash]
    );
    console.log(`Created user ${u.email} / password: ${u.password}`);
  }

  console.log("Seeding complete. Log in and change this password (or add real team members) before going live.");
  await pool.end();
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
