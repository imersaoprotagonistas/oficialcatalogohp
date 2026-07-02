import { Router } from "express";
import { pool } from "../db.js";
import { optionalAuth, requireAuth } from "../middleware/requireAuth.js";
import { ah } from "../asyncHandler.js";

const router = Router();

function toRow(c) {
  return {
    id: c.id,
    nome: c.nome,
    setor: c.setor,
    itens: c.itens,
    status: c.status,
    criadoEm: new Date(c.criado_em).getTime(),
    capa: c.capa,
    subtitulo: c.subtitulo,
    corDestaque: c.cor_destaque,
  };
}

// Visitantes e consultores só veem catálogos publicados; o gerente vê todos (inclui rascunho/inativo).
router.get("/", optionalAuth, ah(async (req, res) => {
  const isGerente = req.user?.role === "gerente";
  const { rows } = isGerente
    ? await pool.query("select * from catalogos order by criado_em desc")
    : await pool.query("select * from catalogos where status = 'publicado' order by criado_em desc");
  res.json(rows.map(toRow));
}));

router.post("/", requireAuth(["gerente"]), ah(async (req, res) => {
  const b = req.body || {};
  const id = b.id || `cat_${Date.now()}`;
  const { rows } = await pool.query(
    `insert into catalogos (id, nome, setor, itens, status, capa, subtitulo, cor_destaque)
     values ($1,$2,$3,$4,$5,$6,$7,$8) returning *`,
    [id, b.nome, b.setor, JSON.stringify(b.itens || []), b.status || "rascunho", b.capa, b.subtitulo, b.corDestaque]
  );
  res.status(201).json(toRow(rows[0]));
}));

router.put("/:id", requireAuth(["gerente"]), ah(async (req, res) => {
  const b = req.body || {};
  const { rows } = await pool.query(
    `update catalogos set
       nome=coalesce($1, nome), setor=coalesce($2, setor), itens=coalesce($3, itens),
       status=coalesce($4, status), capa=coalesce($5, capa), subtitulo=coalesce($6, subtitulo),
       cor_destaque=coalesce($7, cor_destaque)
     where id=$8 returning *`,
    [b.nome, b.setor, b.itens ? JSON.stringify(b.itens) : null, b.status, b.capa, b.subtitulo, b.corDestaque, req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ erro: "Catálogo não encontrado." });
  res.json(toRow(rows[0]));
}));

export default router;
