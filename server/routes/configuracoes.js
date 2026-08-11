const { Router } = require("express");
const { pool } = require("../db.js");
const { requireAuth } = require("../middleware/requireAuth.js");
const { ah } = require("../asyncHandler.js");

const router = Router();

// Config única da empresa (1 linha fixa, id="global" — ver schema.sql). Hoje só existe esse
// flag: como o gerente comercial não tem conta individual (login único, sem id — ver
// server/routes/auth.js), não dá pra decidir "pode editar custo" por pessoa como acontece com
// o comprador (compradores.pode_editar_custo); é o gerente de compras quem liga/desliga isso
// pra TODO gerente comercial de uma vez, na aba Equipe (ver src/App.jsx/CompradoresSection).
router.get("/", requireAuth(["compras", "gerente"]), ah(async (req, res) => {
  const { rows } = await pool.query("select gerente_comercial_pode_custo from configuracoes where id = 'global'");
  res.json({ gerenteComercialPodeCusto: rows[0]?.gerente_comercial_pode_custo ?? true });
}));

// Só o gerente de compras (eh_gerente=true) altera — mesma regra de quem gerencia a equipe
// (ver soGerenteDeCompras em server/routes/compradores.js). O gerente comercial só lê (acima).
router.put("/", requireAuth(["compras"]), ah(async (req, res) => {
  if (!req.user.ehGerente) return res.status(403).json({ erro: "Sem permissão." });
  const valor = !!(req.body || {}).gerenteComercialPodeCusto;
  await pool.query(
    `insert into configuracoes (id, gerente_comercial_pode_custo) values ('global', $1)
     on conflict (id) do update set gerente_comercial_pode_custo = $1`,
    [valor]
  );
  res.json({ gerenteComercialPodeCusto: valor });
}));

module.exports = router;
