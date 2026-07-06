// Entrypoint só pro desenvolvimento local (`npm run server`). Em produção (Vercel),
// quem serve a API é api/index.js, que importa app.js diretamente como função serverless.
const app = require("./app.js");

const port = process.env.PORT || 3001;
app.listen(port, () => console.log(`API HP Catálogo rodando na porta ${port}`));
