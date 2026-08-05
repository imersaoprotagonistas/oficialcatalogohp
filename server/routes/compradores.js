const { Router } = require("express");
const { randomUUID } = require("crypto");
const { pool } = require("../db.js");
const { requireAuth } = require("../middleware/requireAuth.js");
const { hashSenha } = require("../auth.js");
const { ah } = require("../asyncHandler.js");

const router = Router();

// senha_hash nunca sai do servidor. Diferente de consultores, essa lista não tem uso
// público (não aparece pro cliente final) — todo mundo aqui já exige login de compras.
// De propósito não aceita o login de "gerente" (comercial): o setor de Compras é isolado —
// o gerente comercial não pode ver nem gerenciar nada daqui.
function toRow(c) {
  return { id: c.id, nome: c.nome, email: c.email, ehGerente: c.eh_gerente };
}

// Só quem tem eh_gerente=true pode ver/gerenciar a equipe — um comprador comum (a maioria)
// recebe 403 aqui, mesmo estando autenticado como "compras" (ver server/routes/auth.js,
// que carimba ehGerente no token no momento do login).
function soGerenteDeCompras(req, res, next) {
  if (!req.user.ehGerente) return res.status(403).json({ erro: "Sem permissão." });
  next();
}

router.get("/", requireAuth(["compras"]), soGerenteDeCompras, ah(async (req, res) => {
  const { rows } = await pool.query("select * from compradores order by nome");
  res.json(rows.map(toRow));
}));

router.post("/", requireAuth(["compras"]), soGerenteDeCompras, ah(async (req, res) => {
  const b = req.body || {};
  if (!b.senha) return res.status(400).json({ erro: "Senha é obrigatória." });
  const id = b.id || randomUUID();
  const senhaHash = await hashSenha(b.senha);
  const { rows } = await pool.query(
    `insert into compradores (id, nome, email, senha_hash, eh_gerente) values ($1,$2,$3,$4,$5) returning *`,
    [id, b.nome, b.email, senhaHash, !!b.ehGerente]
  );
  res.status(201).json(toRow(rows[0]));
}));

router.put("/:id", requireAuth(["compras"]), soGerenteDeCompras, ah(async (req, res) => {
  const b = req.body || {};
  const senhaHash = b.senha ? await hashSenha(b.senha) : null;
  const { rows } = await pool.query(
    `update compradores set nome=$1, email=$2, senha_hash=coalesce($3, senha_hash), eh_gerente=$4
     where id=$5 returning *`,
    [b.nome, b.email, senhaHash, !!b.ehGerente, req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ erro: "Comprador(a) não encontrado(a)." });
  res.json(toRow(rows[0]));
}));

router.delete("/:id", requireAuth(["compras"]), soGerenteDeCompras, ah(async (req, res) => {
  await pool.query("delete from compradores where id=$1", [req.params.id]);
  res.status(204).end();
}));

module.exports = router;
