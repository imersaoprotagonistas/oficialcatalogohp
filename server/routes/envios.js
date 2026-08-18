const { Router } = require("express");
const { randomUUID } = require("crypto");
const { pool } = require("../db.js");
const { requireAuth } = require("../middleware/requireAuth.js");
const { rateLimit } = require("../middleware/rateLimit.js");
const { ah } = require("../asyncHandler.js");

const router = Router();

// Rotas públicas (sem login) que recebem um ID vindo da URL: limita tentativas por IP
// pra dificultar varredura/adivinhação de IDs de envio de outros clientes.
const limiteConsultaPublica = rateLimit({ janelaMs: 60 * 1000, max: 30 });
// Criar envio é mais raro pro visitante legítimo (uma vez por link aberto) — trava mais apertado
// que a consulta acima, pra dificultar quem tenta forjar pedido/visita em massa sem estar
// logado (ver auditoria de segurança de 2026-08: dava pra criar envio e marcar "pedido
// concluído" com preço inventado, sem nenhum limite de tentativas).
const limiteCriarEnvio = rateLimit({ janelaMs: 60 * 1000, max: 10 });

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

// Rastreamento: gerente e compras veem todos os envios (compras usa isso pra saber quanto
// cada produto já foi pedido — informação de compra, não de cliente); consultor só os próprios.
router.get("/", requireAuth(["gerente", "consultor", "compras"]), ah(async (req, res) => {
  const { rows } = req.user.role === "consultor"
    ? await pool.query("select * from envios where consultor_id = $1 order by criado_em desc", [req.user.id])
    : await pool.query("select * from envios order by criado_em desc");
  res.json(rows.map(toRow));
}));

// Rota pública: usada pelo próprio visitante pra checar/reabrir seu envio a partir do link.
router.get("/:id", limiteConsultaPublica, ah(async (req, res) => {
  const { rows } = await pool.query("select * from envios where id = $1", [req.params.id]);
  if (!rows[0]) return res.status(404).json({ erro: "Envio não encontrado." });
  res.json(toRow(rows[0]));
}));

// Rota pública: criada quando um visitante anônimo abre o link de um catálogo. Antes só o
// front-end conferia se o catálogo estava publicado (rota aceitava qualquer catalogoId que
// existisse); agora o servidor confere de novo — sem isso, dava pra forjar envio (e depois
// marcar "pedido concluído" com preço inventado, ver /:id/evento abaixo) em cima de um catálogo
// rascunho/inativo, ou de um catalogoId/consultorId simplesmente adivinhados.
router.post("/", limiteCriarEnvio, ah(async (req, res) => {
  const b = req.body || {};
  if (!b.catalogoId || !b.consultorId) {
    return res.status(400).json({ erro: "catalogoId e consultorId são obrigatórios." });
  }
  const { rows: catalogoRows } = await pool.query("select status from catalogos where id = $1", [b.catalogoId]);
  if (catalogoRows[0]?.status !== "publicado") {
    return res.status(404).json({ erro: "Catálogo não encontrado ou não publicado." });
  }
  const { rows: consultorRows } = await pool.query("select 1 from consultores where id = $1", [b.consultorId]);
  if (!consultorRows[0]) return res.status(404).json({ erro: "Consultor não encontrado." });

  const id = randomUUID(); // token não-previsível (antes misturava timestamp com só 6 chars aleatórios)
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
router.patch("/:id/evento", limiteConsultaPublica, ah(async (req, res) => {
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
