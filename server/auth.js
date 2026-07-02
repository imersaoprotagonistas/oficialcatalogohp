require("dotenv/config");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error("JWT_SECRET não definida. Copie server/.env.example para server/.env e preencha.");
}

function hashSenha(senha) {
  return bcrypt.hash(senha, 10);
}

function verificarSenha(senha, hash) {
  if (!senha || !hash) return Promise.resolve(false);
  return bcrypt.compare(senha, hash);
}

function gerarToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "30d" });
}

function verificarToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

module.exports = { hashSenha, verificarSenha, gerarToken, verificarToken };
