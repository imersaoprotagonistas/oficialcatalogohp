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
    cor: s.cor, // hex — dá o tom do banner dessa seção no catálogo público (ver CatalogoPublico)
  };
}

// Pública: o catálogo do visitante também precisa ler título/descrição/ativo/ordem/cor.
router.get("/", ah(async (req, res) => {
  const { rows } = await pool.query("select * from secoes_curadas order by setor, ordem");
  res.json(rows.map(toRow));
}));

router.put("/:id", requireAuth(["gerente"]), ah(async (req, res) => {
  const b = req.body || {};
  const { rows } = await pool.query(
    `update secoes_curadas set titulo=$1, descricao=$2, ativo=$3, ordem=$4, cor=coalesce($5, cor) where id=$6 returning *`,
    [b.titulo, b.descricao, b.ativo ?? true, b.ordem ?? 0, b.cor || null, req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ erro: "Seção não encontrada." });
  res.json(toRow(rows[0]));
}));

// Cria uma seção nova (setor x chave). Cada seção mora na sua própria linha, então criar
// uma não mexe nas seções já existentes/vigentes na vitrine.
router.post("/", requireAuth(["gerente"]), ah(async (req, res) => {
  const b = req.body || {};
  const setor = b.setor;
  const chave = String(b.chave || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  const titulo = String(b.titulo || "").trim();

  if (!["farm", "primeira"].includes(setor)) return res.status(400).json({ erro: "Setor inválido." });
  if (!chave) return res.status(400).json({ erro: "Chave da seção é obrigatória." });
  if (!titulo) return res.status(400).json({ erro: "Título é obrigatório." });

  const id = `${setor}_${chave}`;
  // "default" só é palavra reservada numa posição da lista VALUES, não dá pra usar como
  // argumento de coalesce(...) — isso gerava erro de sintaxe no Postgres em toda criação de
  // seção. Repete aqui o mesmo default do schema.sql (cor) já que precisa vir como parâmetro.
  const { rows } = await pool.query(
    `insert into secoes_curadas (id, setor, chave, titulo, descricao, ativo, ordem, cor)
     values ($1,$2,$3,$4,$5,$6,$7,$8)
     on conflict (id) do nothing
     returning *`,
    [id, setor, chave, titulo, b.descricao || null, b.ativo ?? true, b.ordem ?? 0, b.cor || "#78716c"]
  );
  if (!rows[0]) return res.status(409).json({ erro: "Já existe uma seção com essa chave nesse setor." });
  res.status(201).json(toRow(rows[0]));
}));

router.delete("/:id", requireAuth(["gerente"]), ah(async (req, res) => {
  const { rows } = await pool.query("delete from secoes_curadas where id=$1 returning *", [req.params.id]);
  if (!rows[0]) return res.status(404).json({ erro: "Seção não encontrada." });
  const secao = rows[0];
  // Só tira o selo dos produtos se nenhuma outra seção (do outro setor) ainda usar essa
  // mesma chave — senão apagaria um selo que continua válido lá.
  const { rows: restantes } = await pool.query("select 1 from secoes_curadas where chave=$1 limit 1", [secao.chave]);
  if (restantes.length === 0) {
    await pool.query(`update produtos set badges = (badges - $1) where badges ? $1`, [secao.chave]);
  }
  res.json(toRow(secao));
}));

module.exports = router;
