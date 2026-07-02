import "dotenv/config";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error("JWT_SECRET não definida. Copie server/.env.example para server/.env e preencha.");
}

export function hashSenha(senha) {
  return bcrypt.hash(senha, 10);
}

export function verificarSenha(senha, hash) {
  if (!senha || !hash) return Promise.resolve(false);
  return bcrypt.compare(senha, hash);
}

export function gerarToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "30d" });
}

export function verificarToken(token) {
  return jwt.verify(token, JWT_SECRET);
}
