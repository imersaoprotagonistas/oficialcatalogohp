require("dotenv/config");
const express = require("express");
const cors = require("cors");

const authRoutes = require("./routes/auth.js");
const produtosRoutes = require("./routes/produtos.js");
const consultoresRoutes = require("./routes/consultores.js");
const catalogosRoutes = require("./routes/catalogos.js");
const enviosRoutes = require("./routes/envios.js");
const secoesRoutes = require("./routes/secoes.js");
const buscasRoutes = require("./routes/buscas.js");

const app = express();

// Evita que qualquer CDN/cache guarde respostas da API.
app.use((req, res, next) => {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.set("Pragma", "no-cache");
  next();
});

app.use(cors());
app.use(express.json({ limit: "15mb" })); // capas de catálogo vão em base64 no corpo

app.use("/api/auth", authRoutes);
app.use("/api/produtos", produtosRoutes);
app.use("/api/consultores", consultoresRoutes);
app.use("/api/catalogos", catalogosRoutes);
app.use("/api/envios", enviosRoutes);
app.use("/api/secoes", secoesRoutes);
app.use("/api/buscas", buscasRoutes);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ erro: "Erro interno do servidor." });
});

module.exports = app;
