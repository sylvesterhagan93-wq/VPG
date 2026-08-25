// Postgres connection (Supabase) - schema lives in Supabase as migrations,
// not created here at runtime. Set DATABASE_URL in your environment (see
// .env.example). Supabase requires SSL; rejectUnauthorized is left off
// here for simplicity - swap in Supabase's CA bundle if you want strict
// certificate verification.
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

pool.on("error", (err) => {
  console.error("Unexpected error on idle Postgres client", err);
});

module.exports = pool;
