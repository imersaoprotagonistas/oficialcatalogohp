const { Router } = require("express");
const { randomUUID } = require("crypto");
const { pool } = require("../db.js");
const { requireAuth } = require("../middleware/requireAuth.js");
const { ah } = require("../asyncHandler.js");

const router = Router();

// Pública: o próprio visitante registra quando busca algo e não acha nada no catálogo.
router.post("/", ah(async (req, res) => {
  const b = req.body || {};
  const termo = (b.termo || "").trim().slice(0, 200);
  if (!b.catalogoId || !b.consultorId || !termo) {
    return res.status(400).json({ erro: "catalogoId, consultorId e termo são obrigatórios." });
  }
  await pool.query(
    `insert into buscas_sem_resultado (id, catalogo_id, consultor_id, termo) values ($1,$2,$3,$4)`,
    [randomUUID(), b.catalogoId, b.consultorId, termo]
  );
  res.status(201).end();
}));

// Gerente: agregado por termo, pra virar sinal de demanda (o que os clientes procuram e não têm).
router.get("/", requireAuth(["gerente"]), ah(async (req, res) => {
  const { rows } = await pool.query(`
    select termo, count(*)::int as qtd, max(criado_em) as ultima
    from buscas_sem_resultado
    group by termo
    order by qtd desc, ultima desc
    limit 100
  `);
  res.json(rows.map((r) => ({ termo: r.termo, qtd: r.qtd, ultima: new Date(r.ultima).getTime() })));
}));

module.exports = router;
