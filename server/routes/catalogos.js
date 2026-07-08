const { Router } = require("express");
const { pool } = require("../db.js");
const { optionalAuth, requireAuth } = require("../middleware/requireAuth.js");
const { ah } = require("../asyncHandler.js");

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
    dataInicio: c.data_inicio, // "AAAA-MM-DD" ou null (catálogo criado antes dessa coluna existir)
    dataFim: c.data_fim,
  };
}

// Visitantes e consultores só veem catálogos publicados; o gerente vê todos (inclui rascunho/inativo).
router.get("/", optionalAuth, ah(async (req, res) => {
  // Sem cron/worker no projeto — a expiração é aplicada aqui, toda vez que alguém lista os
  // catálogos (gerente, consultor ou visitante abrindo um link). Assim que passa do data_fim,
  // o catálogo publicado vira inativo de verdade no banco, não só um aviso visual.
  await pool.query(
    `update catalogos set status = 'inativo'
     where status = 'publicado' and data_fim is not null and data_fim < current_date`
  );

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
    `insert into catalogos (id, nome, setor, itens, status, capa, subtitulo, cor_destaque, data_inicio, data_fim)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning *`,
    [id, b.nome, b.setor, JSON.stringify(b.itens || []), b.status || "rascunho", b.capa, b.subtitulo, b.corDestaque,
      b.dataInicio || null, b.dataFim || null]
  );
  res.status(201).json(toRow(rows[0]));
}));

router.put("/:id", requireAuth(["gerente"]), ah(async (req, res) => {
  const b = req.body || {};
  const { rows } = await pool.query(
    `update catalogos set
       nome=coalesce($1, nome), setor=coalesce($2, setor), itens=coalesce($3, itens),
       status=coalesce($4, status), capa=coalesce($5, capa), subtitulo=coalesce($6, subtitulo),
       cor_destaque=coalesce($7, cor_destaque), data_inicio=coalesce($8, data_inicio), data_fim=coalesce($9, data_fim)
     where id=$10 returning *`,
    [b.nome, b.setor, b.itens ? JSON.stringify(b.itens) : null, b.status, b.capa, b.subtitulo, b.corDestaque,
      b.dataInicio || null, b.dataFim || null, req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ erro: "Catálogo não encontrado." });
  res.json(toRow(rows[0]));
}));

module.exports = router;
