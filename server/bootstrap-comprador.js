// Cria (ou promove) o primeiro comprador(a) com eh_gerente=true — resolve o "ovo e a galinha"
// de precisar de um gerente de compras pra cadastrar o primeiro gerente de compras.
// Depois desse primeiro, os demais (gerentes ou não) são cadastrados pela própria tela
// "Equipe" dentro do login de Compras — não precisa rodar este script de novo.
// Uso: npm run bootstrap-comprador -- "Nome" "email@exemplo.com" "senha"
const { randomUUID } = require("crypto");
const { pool } = require("./db.js");
const { hashSenha } = require("./auth.js");

async function main() {
  const [nome, email, senha] = process.argv.slice(2);
  if (!nome || !email || !senha) {
    console.error('Uso: npm run bootstrap-comprador -- "Nome" "email@exemplo.com" "senha"');
    process.exit(1);
  }
  const senhaHash = await hashSenha(senha);
  const { rows } = await pool.query(
    `insert into compradores (id, nome, email, senha_hash, eh_gerente)
     values ($1, $2, $3, $4, true)
     on conflict (email) do update set nome = excluded.nome, senha_hash = excluded.senha_hash, eh_gerente = true
     returning id, nome, email`,
    [randomUUID(), nome, email, senhaHash]
  );
  console.log(`Comprador(a) gerente pronto: ${rows[0].nome} <${rows[0].email}>`);
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
