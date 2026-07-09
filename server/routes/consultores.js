const { Router } = require("express");
const { randomUUID } = require("crypto");
const { pool } = require("../db.js");
const { requireAuth, optionalAuth } = require("../middleware/requireAuth.js");
const { hashSenha } = require("../auth.js");
const { ah } = require("../asyncHandler.js");

const router = Router();

// senha_hash nunca sai do servidor. whatsapp fica público de propósito (é o número que o
// cliente usa pra falar com o consultor no catálogo); email só é interno, não tem uso
// público, então só sai pra quem estiver logado como gerente.
function toRow(c, incluirEmail) {
  const row = { id: c.id, nome: c.nome, whatsapp: c.whatsapp, setor: c.setor };
  if (incluirEmail) row.email = c.email;
  return row;
}

router.get("/", optionalAuth, ah(async (req, res) => {
  const { rows } = await pool.query("select * from consultores order by nome");
  res.json(rows.map((c) => toRow(c, req.user?.role === "gerente")));
}));

router.post("/", requireAuth(["gerente"]), ah(async (req, res) => {
  const b = req.body || {};
  if (!b.senha) return res.status(400).json({ erro: "Senha é obrigatória." });
  const id = b.id || randomUUID();
  const senhaHash = await hashSenha(b.senha);
  const { rows } = await pool.query(
    `insert into consultores (id, nome, email, whatsapp, setor, senha_hash) values ($1,$2,$3,$4,$5,$6) returning *`,
    [id, b.nome, b.email, b.whatsapp, b.setor, senhaHash]
  );
  res.status(201).json(toRow(rows[0], true));
}));

router.put("/:id", requireAuth(["gerente"]), ah(async (req, res) => {
  const b = req.body || {};
  const senhaHash = b.senha ? await hashSenha(b.senha) : null;
  const { rows } = await pool.query(
    `update consultores set nome=$1, email=$2, whatsapp=$3, setor=$4, senha_hash=coalesce($5, senha_hash)
     where id=$6 returning *`,
    [b.nome, b.email, b.whatsapp, b.setor, senhaHash, req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ erro: "Consultor não encontrado." });
  res.json(toRow(rows[0], true));
}));

router.delete("/:id", requireAuth(["gerente"]), ah(async (req, res) => {
  await pool.query("delete from consultores where id=$1", [req.params.id]);
  res.status(204).end();
}));

module.exports = router;
