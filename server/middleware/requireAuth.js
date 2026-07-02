const { verificarToken } = require("../auth.js");

function extrairToken(req) {
  const header = req.headers.authorization || "";
  return header.startsWith("Bearer ") ? header.slice(7) : null;
}

function requireAuth(roles) {
  return (req, res, next) => {
    const token = extrairToken(req);
    if (!token) return res.status(401).json({ erro: "Não autenticado." });
    try {
      const payload = verificarToken(token);
      if (roles && !roles.includes(payload.role)) {
        return res.status(403).json({ erro: "Sem permissão." });
      }
      req.user = payload;
      next();
    } catch {
      res.status(401).json({ erro: "Token inválido ou expirado." });
    }
  };
}

function optionalAuth(req, res, next) {
  const token = extrairToken(req);
  if (token) {
    try {
      req.user = verificarToken(token);
    } catch {
      // token inválido em rota pública: segue sem usuário autenticado
    }
  }
  next();
}

module.exports = { requireAuth, optionalAuth };
