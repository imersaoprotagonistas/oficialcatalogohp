const { Router } = require("express");
const { randomUUID } = require("crypto");
const { pool } = require("../db.js");
const { requireAuth } = require("../middleware/requireAuth.js");
const { ah } = require("../asyncHandler.js");

const router = Router();

// A foto vai em base64 dentro da coluna "imagem" (até 15mb, ver server/app.js). Embutir isso
// em toda listagem deixava o catálogo público baixando ~40mb só de fotos antes de mostrar
// qualquer produto. Agora a listagem só diz "temImagem" e a foto em si sai por uma rota própria
// (/:id/imagem), servida como imagem de verdade — o navegador cacheia e carrega sob demanda.
function toRow(p) {
  return {
    id: p.id,
    nome: p.nome,
    gramatura: p.gramatura,
    categoria: p.categoria,
    descricao: p.descricao,
    emoji: p.emoji,
    temImagem: p.tem_imagem ?? !!p.imagem,
    ativo: p.ativo,
    marca: p.marca,
    sabores: p.sabores || [], // array de sabores disponíveis, ex: ["Chocolate","Baunilha"]
    custo: p.custo === null ? 0 : Number(p.custo),
    badges: p.badges,
    notaPromo: p.nota_promo,
    precos: p.precos, // { primeira: { de, desconto, parcelado, vista }, farm: { de, desconto, parcelado, vista } }
  };
}

// Não seleciona a coluna "imagem" aqui: além de não ir pro cliente, evita puxar ~40mb de base64
// do Postgres pro servidor a cada listagem só pra descartar em seguida.
router.get("/", ah(async (req, res) => {
  const { rows } = await pool.query(
    `select id, nome, gramatura, categoria, descricao, emoji, (imagem is not null) as tem_imagem,
       ativo, marca, sabores, custo, badges, nota_promo, precos
     from produtos order by nome`
  );
  res.json(rows.map(toRow));
}));

// Serve a foto de verdade (não o JSON) a partir do data URL salvo em "imagem", com cache no
// navegador — sobrescreve o no-store global (server/app.js) só pra esta rota.
router.get("/:id/imagem", ah(async (req, res) => {
  const { rows } = await pool.query("select imagem from produtos where id = $1", [req.params.id]);
  const dataUrl = rows[0]?.imagem;
  const m = dataUrl && dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!m) return res.status(404).end();
  res.set("Cache-Control", "public, max-age=86400");
  res.set("Content-Type", m[1]);
  res.send(Buffer.from(m[2], "base64"));
}));

router.post("/", requireAuth(["gerente"]), ah(async (req, res) => {
  const b = req.body || {};
  const id = b.id || randomUUID();
  const { rows } = await pool.query(
    `insert into produtos (id, nome, gramatura, categoria, descricao, emoji, imagem, ativo, marca, sabores, custo, badges, nota_promo, precos)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) returning *`,
    [id, b.nome, b.gramatura, b.categoria, b.descricao, b.emoji, b.imagem, b.ativo ?? true, b.marca,
      JSON.stringify(b.sabores || []), b.custo || 0, JSON.stringify(b.badges || []), b.notaPromo, JSON.stringify(b.precos || {})]
  );
  res.status(201).json(toRow(rows[0]));
}));

router.put("/:id", requireAuth(["gerente"]), ah(async (req, res) => {
  const b = req.body || {};
  const { rows } = await pool.query(
    `update produtos set nome=$1, gramatura=$2, categoria=$3, descricao=$4, emoji=$5, imagem=$6, ativo=$7,
       marca=$8, sabores=$9, custo=$10, badges=$11, nota_promo=$12, precos=$13
     where id=$14 returning *`,
    [b.nome, b.gramatura, b.categoria, b.descricao, b.emoji, b.imagem, b.ativo ?? true, b.marca,
      JSON.stringify(b.sabores || []), b.custo || 0, JSON.stringify(b.badges || []), b.notaPromo, JSON.stringify(b.precos || {}), req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ erro: "Produto não encontrado." });
  res.json(toRow(rows[0]));
}));

router.delete("/:id", requireAuth(["gerente"]), ah(async (req, res) => {
  await pool.query("delete from produtos where id=$1", [req.params.id]);
  res.status(204).end();
}));

module.exports = router;
