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

app.use(cors());
app.use(express.json({ limit: "15mb" })); // capas de catálogo vão em base64 no corpo

app.use("/api/auth", authRoutes);
app.use("/api/produtos", produtosRoutes);
app.use("/api/consultores", consultoresRoutes);
app.use("/api/catalogos", catalogosRoutes);
app.use("/api/envios", enviosRoutes);

// Serve o build do frontend (dist/) quando ele existir, pra rodar tudo num processo só na Turbocloud.
const distPath = path.join(__dirname, "..", "dist");
app.use(express.static(distPath));
app.get(/^(?!\/api\/).*/, (req, res, next) => {
  res.sendFile(path.join(distPath, "index.html"), (err) => { if (err) next(); });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ erro: "Erro interno do servidor." });
});

const port = process.env.PORT || 3001;
app.listen(port, () => console.log(`API HP Catálogo rodando na porta ${port}`));
