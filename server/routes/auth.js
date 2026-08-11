const { Router } = require("express");
const { pool } = require("../db.js");
const { verificarSenha, gerarToken } = require("../auth.js");
const { ah } = require("../asyncHandler.js");
const { rateLimit } = require("../middleware/rateLimit.js");

const router = Router();

// Barra força-bruta de senha: 8 tentativas a cada 10 min por IP nesta rota.
const limiteLogin = rateLimit({ janelaMs: 10 * 60 * 1000, max: 8 });

router.post("/login", limiteLogin, ah(async (req, res) => {
  const { role, email, senha } = req.body || {};

  if (role === "gerente") {
    const ok = await verificarSenha(senha, process.env.GERENTE_SENHA_HASH);
    if (!ok) return res.status(401).json({ erro: "Senha incorreta." });
    return res.json({ token: gerarToken({ role: "gerente" }), user: { role: "gerente" } });
  }

  if (role === "consultor") {
    const { rows } = await pool.query("select * from consultores where lower(email) = lower($1)", [email || ""]);
    const consultor = rows[0];
    const ok = consultor && (await verificarSenha(senha, consultor.senha_hash));
    if (!ok) return res.status(401).json({ erro: "Consultor ou senha incorretos." });
    const { senha_hash, ...semSenha } = consultor;
    return res.json({
      token: gerarToken({ role: "consultor", id: consultor.id }),
      user: { role: "consultor", ...semSenha },
    });
  }

  if (role === "compras") {
    const { rows } = await pool.query("select * from compradores where lower(email) = lower($1)", [email || ""]);
    const comprador = rows[0];
    const ok = comprador && (await verificarSenha(senha, comprador.senha_hash));
    if (!ok) return res.status(401).json({ erro: "Comprador(a) ou senha incorretos." });
    // ehGerente, podeEditarCusto e nome vão no token (não só na resposta) porque
    // server/routes/compradores.js e server/routes/produtos.js (histórico e permissão de
    // custo) usam isso direto do token — sem depender do cliente mandar de volta. Como fica
    // carimbado no login, uma mudança de permissão só vale a partir do próximo login dessa
    // pessoa (mesma limitação que ehGerente já tinha).
    const { senha_hash, eh_gerente, pode_editar_custo, ...semSenha } = comprador;
    return res.json({
      token: gerarToken({ role: "compras", id: comprador.id, ehGerente: eh_gerente, podeEditarCusto: pode_editar_custo, nome: comprador.nome }),
      user: { role: "compras", ehGerente: eh_gerente, podeEditarCusto: pode_editar_custo, ...semSenha },
    });
  }

  res.status(400).json({ erro: "Papel inválido." });
}));

module.exports = router;
