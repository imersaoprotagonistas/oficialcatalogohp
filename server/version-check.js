console.log("NODE VERSION:", process.version);
try {
  console.log("PG VERSION:", require("pg/package.json").version);
} catch (e) {
  console.log("Erro ao carregar pg:", e.message);
}
