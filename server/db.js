require("dotenv/config");
const { Pool, types } = require("pg");

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL não definida. Copie server/.env.example para server/.env e preencha.");
}

// DATE (oid 1082) sai como "AAAA-MM-DD" puro, sem virar Date — o parser padrão do pg monta
// um Date que desloca de dia dependendo do fuso, o que é exatamente o tipo de bug sutil que
// não queremos numa data de validade de catálogo.
types.setTypeParser(1082, (val) => val);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 1, // em serverless (Vercel) cada instância abre seu próprio pool; mantém baixo e deixa o pooler (porta 6543) multiplexar
});

// Sem isso, um erro de conexão (ex: o pooler do Supabase derrubando um client ocioso, ou uma
// query grande demais) sobe como exceção não tratada e derruba a instância serverless inteira
// — inclusive pra outras requisições que reaproveitam essa mesma instância "quente" depois.
pool.on("error", (err) => {
  console.error("Erro na pool do Postgres:", err);
});

module.exports = { pool };
