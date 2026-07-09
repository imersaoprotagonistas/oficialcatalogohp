// Limitador simples em memória: barra scripts que martelam login ou tentam
// adivinhar IDs por força bruta. Não é distribuído entre instâncias serverless,
// mas já é uma barreira real contra ataques automatizados não sofisticados.
const janelas = new Map();

setInterval(() => {
  const agora = Date.now();
  for (const [chave, registro] of janelas) {
    if (agora - registro.inicio > registro.janelaMs) janelas.delete(chave);
  }
}, 10 * 60 * 1000).unref();

function rateLimit({ janelaMs, max }) {
  return (req, res, next) => {
    const chave = `${req.ip}:${req.method}:${req.baseUrl}${req.path}`;
    const agora = Date.now();
    const registro = janelas.get(chave);
    if (!registro || agora - registro.inicio > janelaMs) {
      janelas.set(chave, { inicio: agora, contagem: 1, janelaMs });
      return next();
    }
    registro.contagem++;
    if (registro.contagem > max) {
      return res.status(429).json({ erro: "Muitas tentativas. Aguarde um momento e tente de novo." });
    }
    next();
  };
}

module.exports = { rateLimit };
