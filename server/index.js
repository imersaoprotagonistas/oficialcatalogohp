import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

import authRoutes from "./routes/auth.js";
import produtosRoutes from "./routes/produtos.js";
import consultoresRoutes from "./routes/consultores.js";
import catalogosRoutes from "./routes/catalogos.js";
import enviosRoutes from "./routes/envios.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
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
