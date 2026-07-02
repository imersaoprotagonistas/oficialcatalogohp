import { Router } from "express";
import { randomUUID } from "crypto";
import { pool } from "../db.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { hashSenha } from "../auth.js";
import { ah } from "../asyncHandler.js";

const router = Router();

// senha_hash nunca sai do servidor
function toRow(c) {
  return { id: c.id, nome: c.nome, email: c.email, whatsapp: c.whatsapp, setor: c.setor };
}

router.get("/", ah(async (req, res) => {
  const { rows } = await pool.query("select * from consultores order by nome");
  res.json(rows.map(toRow));
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
  res.status(201).json(toRow(rows[0]));
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
  res.json(toRow(rows[0]));
}));

router.delete("/:id", requireAuth(["gerente"]), ah(async (req, res) => {
  await pool.query("delete from consultores where id=$1", [req.params.id]);
  res.status(204).end();
}));

export default router;
