require("dotenv/config");
const express = require("express");
const cors = require("cors");
const path = require("path");

const authRoutes = require("./routes/auth.js");
const produtosRoutes = require("./routes/produtos.js");
const consultoresRoutes = require("./routes/consultores.js");
const catalogosRoutes = require("./routes/catalogos.js");
const enviosRoutes = require("./routes/envios.js");

const app = express();

// DIAGNÓSTICO TEMPORÁRIO — remover depois de descobrir o problema do BASE_PATH.
app.use((req, res, next) => {
  if (req.query.debug === "1") {
    return res.json({ path: req.path, originalUrl: req.originalUrl, baseUrl: req.baseUrl, BASE_PATH: process.env.BASE_PATH || null });
  }
  next();
});

// Algumas hospedagens (ex: cPanel com "Application URL" numa subpasta, como
// /catalogohp) encaminham a URL inteira pro Node, sem tirar a subpasta da frente.
// BASE_PATH deixa a app ciente disso. Deixe em branco (ou não defina) se o site
// estiver na raiz do domínio/subdomínio.
const BASE_PATH = (process.env.BASE_PATH || "").replace(/\/$/, "");

app.use(cors());
app.use(express.json({ limit: "15mb" })); // capas de catálogo vão em base64 no corpo

app.use(`${BASE_PATH}/api/auth`, authRoutes);
app.use(`${BASE_PATH}/api/produtos`, produtosRoutes);
app.use(`${BASE_PATH}/api/consultores`, consultoresRoutes);
app.use(`${BASE_PATH}/api/catalogos`, catalogosRoutes);
app.use(`${BASE_PATH}/api/envios`, enviosRoutes);

// Serve o build do frontend (dist/) quando ele existir, pra rodar tudo num processo só na Turbocloud.
const distPath = path.join(__dirname, "..", "dist");
app.use(BASE_PATH || "/", express.static(distPath));
app.get("*", (req, res, next) => {
  if (req.path.startsWith(`${BASE_PATH}/api/`)) return next();
  res.sendFile(path.join(distPath, "index.html"), (err) => { if (err) next(); });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ erro: "Erro interno do servidor." });
});

const port = process.env.PORT || 3001;
app.listen(port, () => console.log(`API HP Catálogo rodando na porta ${port}`));
