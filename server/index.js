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

// Algumas hospedagens (ex: cPanel/Passenger com "Application URL" numa subpasta,
// como /catalogohp) encaminham a URL inteira pro Node, sem tirar a subpasta da
// frente. BASE_PATH deixa a app ciente disso. Deixe em branco (ou não defina) se
// o site estiver na raiz do domínio/subdomínio.
const BASE_PATH = (process.env.BASE_PATH || "").replace(/\/$/, "");

// Evita que qualquer cache (inclusive o cache interno do LiteSpeed, que roda no
// servidor web e não aparece nas configurações do cPanel) guarde essas respostas.
app.use((req, res, next) => {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.set("X-LiteSpeed-Cache-Control", "no-cache");
  res.set("Pragma", "no-cache");
  next();
});

// DIAGNÓSTICO TEMPORÁRIO — caminho fixo, não depende de query string.
app.get(`${BASE_PATH}/__debug`, (req, res) => {
  res.json({ ok: true, path: req.path, originalUrl: req.originalUrl, BASE_PATH: process.env.BASE_PATH || null, nodeVersion: process.version });
});

app.use(cors());
app.use(express.json({ limit: "15mb" })); // capas de catálogo vão em base64 no corpo

app.use(`${BASE_PATH}/api/auth`, authRoutes);
app.use(`${BASE_PATH}/api/produtos`, produtosRoutes);
app.use(`${BASE_PATH}/api/consultores`, consultoresRoutes);
app.use(`${BASE_PATH}/api/catalogos`, catalogosRoutes);
app.use(`${BASE_PATH}/api/envios`, enviosRoutes);

// Serve o build do frontend (dist/) quando ele existir, pra rodar tudo num processo só na Turbocloud.
const distPath = path.join(__dirname, "..", "dist");
app.use(BASE_PATH || "/", express.static(distPath, { etag: false, lastModified: false, cacheControl: false }));
app.get("*", (req, res, next) => {
  if (req.path.startsWith(`${BASE_PATH}/api/`) || req.path === `${BASE_PATH}/__debug`) return next();
  res.sendFile(path.join(distPath, "index.html"), { etag: false, lastModified: false, cacheControl: false }, (err) => { if (err) next(); });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ erro: "Erro interno do servidor." });
});

const port = process.env.PORT || 3001;
app.listen(port, () => console.log(`API HP Catálogo rodando na porta ${port}`));
