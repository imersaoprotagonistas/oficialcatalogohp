const { Router } = require("express");
const { pool } = require("../db.js");
const { requireAuth } = require("../middleware/requireAuth.js");
const { ah } = require("../asyncHandler.js");

const router = Router();

function toRow(s) {
  return {
    id: s.id,
    setor: s.setor,
    chave: s.chave,
    titulo: s.titulo,
    descricao: s.descricao,
    ativo: s.ativo,
    ordem: s.ordem,
  };
}

// Pública: o catálogo do visitante também precisa ler título/descrição/ativo/ordem.
router.get("/", ah(async (req, res) => {
  const { rows } = await pool.query("select * from secoes_curadas order by setor, ordem");
  res.json(rows.map(toRow));
}));

router.put("/:id", requireAuth(["gerente"]), ah(async (req, res) => {
  const b = req.body || {};
  const { rows } = await pool.query(
    `update secoes_curadas set titulo=$1, descricao=$2, ativo=$3, ordem=$4 where id=$5 returning *`,
    [b.titulo, b.descricao, b.ativo ?? true, b.ordem ?? 0, req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ erro: "Seção não encontrada." });
  res.json(toRow(rows[0]));
}));

module.exports = router;
