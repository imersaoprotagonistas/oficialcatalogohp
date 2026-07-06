require("dotenv/config");
const { Pool } = require("pg");

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL não definida. Copie server/.env.example para server/.env e preencha.");
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 1, // em serverless (Vercel) cada instância abre seu próprio pool; mantém baixo e deixa o pooler (porta 6543) multiplexar
});

module.exports = { pool };
