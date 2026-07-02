const { Router } = require("express");
const { randomUUID } = require("crypto");
const { pool } = require("../db.js");
const { requireAuth } = require("../middleware/requireAuth.js");
const { ah } = require("../asyncHandler.js");

const router = Router();

function toRow(e) {
  return {
    id: e.id,
    catalogoId: e.catalogo_id,
    consultorId: e.consultor_id,
    clienteNome: e.cliente_nome,
    clienteTelefone: e.cliente_telefone,
    criadoEm: new Date(e.criado_em).getTime(),
    visualizadoEm: e.visualizado_em ? new Date(e.visualizado_em).getTime() : null,
    carrinhoEm: e.carrinho_em ? new Date(e.carrinho_em).getTime() : null,
    pedidoEm: e.pedido_em ? new Date(e.pedido_em).getTime() : null,
    pedidoDetalhe: e.pedido_detalhe,
  };
}

// Rastreamento: gerente vê todos os envios, consultor só os próprios.
router.get("/", requireAuth(["gerente", "consultor"]), ah(async (req, res) => {
  const { rows } = req.user.role === "gerente"
    ? await pool.query("select * from envios order by criado_em desc")
    : await pool.query("select * from envios where consultor_id = $1 order by criado_em desc", [req.user.id]);
  res.json(rows.map(toRow));
}));

// Rota pública: usada pelo próprio visitante pra checar/reabrir seu envio a partir do link.
router.get("/:id", ah(async (req, res) => {
  const { rows } = await pool.query("select * from envios where id = $1", [req.params.id]);
  if (!rows[0]) return res.status(404).json({ erro: "Envio não encontrado." });
  res.json(toRow(rows[0]));
}));

// Rota pública: criada quando um visitante anônimo abre o link de um catálogo.
router.post("/", ah(async (req, res) => {
  const b = req.body || {};
  if (!b.catalogoId || !b.consultorId) {
    return res.status(400).json({ erro: "catalogoId e consultorId são obrigatórios." });
  }
  const id = `env_${Date.now()}_${randomUUID().slice(0, 6)}`;
  const { rows } = await pool.query(
    `insert into envios (id, catalogo_id, consultor_id, cliente_nome, cliente_telefone)
     values ($1,$2,$3,$4,$5) returning *`,
    [id, b.catalogoId, b.consultorId, b.clienteNome || "Visitante", b.clienteTelefone || ""]
  );
  res.status(201).json(toRow(rows[0]));
}));

const COLUNA_POR_CAMPO = {
  visualizadoEm: "visualizado_em",
  carrinhoEm: "carrinho_em",
  pedidoEm: "pedido_em",
};

// Rota pública: o próprio visitante marca os passos do funil (visualizou / carrinho / pedido).
router.patch("/:id/evento", ah(async (req, res) => {
  const { campo, pedidoDetalhe } = req.body || {};
  const coluna = COLUNA_POR_CAMPO[campo];
  if (!coluna) return res.status(400).json({ erro: "Campo de evento inválido." });

  const { rows } = campo === "pedidoEm"
    ? await pool.query(
        `update envios set pedido_em = now(), pedido_detalhe = $2 where id = $1 returning *`,
        [req.params.id, JSON.stringify(pedidoDetalhe || null)]
      )
    : await pool.query(
        `update envios set ${coluna} = coalesce(${coluna}, now()) where id = $1 returning *`,
        [req.params.id]
      );

  if (!rows[0]) return res.status(404).json({ erro: "Envio não encontrado." });
  res.json(toRow(rows[0]));
}));

module.exports = router;
