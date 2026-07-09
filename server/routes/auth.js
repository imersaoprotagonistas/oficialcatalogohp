const { Router } = require("express");
const { pool } = require("../db.js");
const { verificarSenha, gerarToken } = require("../auth.js");
const { ah } = require("../asyncHandler.js");
const { rateLimit } = require("../middleware/rateLimit.js");

const router = Router();

// Barra força-bruta de senha: 8 tentativas a cada 10 min por IP nesta rota.
const limiteLogin = rateLimit({ janelaMs: 10 * 60 * 1000, max: 8 });

router.post("/login", limiteLogin, ah(async (req, res) => {
  const { role, consultorId, senha } = req.body || {};

  if (role === "gerente") {
    const ok = await verificarSenha(senha, process.env.GERENTE_SENHA_HASH);
    if (!ok) return res.status(401).json({ erro: "Senha incorreta." });
    return res.json({ token: gerarToken({ role: "gerente" }), user: { role: "gerente" } });
  }

  if (role === "consultor") {
    const { rows } = await pool.query("select * from consultores where id = $1", [consultorId]);
    const consultor = rows[0];
    const ok = consultor && (await verificarSenha(senha, consultor.senha_hash));
    if (!ok) return res.status(401).json({ erro: "Consultor ou senha incorretos." });
    const { senha_hash, ...semSenha } = consultor;
    return res.json({
      token: gerarToken({ role: "consultor", id: consultor.id }),
      user: { role: "consultor", ...semSenha },
    });
  }

  res.status(400).json({ erro: "Papel inválido." });
}));

module.exports = router;
