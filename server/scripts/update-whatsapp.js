// Script único: atualiza os números reais de WhatsApp dos consultores no banco
// (o seed usa "on conflict do nothing", então quem já foi inserido com o número
// de teste precisa ser corrigido via UPDATE). Rode com: node server/scripts/update-whatsapp.js
require("dotenv/config");
const { pool } = require("../db.js");

const NUMEROS = {
  farm1: "5585999891937", // Maycon Costa
  farm2: "5585988442442", // Janderson
  farm4: "5585988711224", // Giovana
  farm6: "5585986985953", // Caio Melo
  farm7: "5585981470157", // Valesca
  farm8: "5585987439381", // Sangela
  primeira1: "5585999166784", // Aline
};

async function run() {
  for (const [id, whatsapp] of Object.entries(NUMEROS)) {
    const { rowCount } = await pool.query(
      "update consultores set whatsapp = $1 where id = $2",
      [whatsapp, id]
    );
    console.log(rowCount ? `OK  ${id} -> ${whatsapp}` : `!! ${id} não encontrado`);
  }
  await pool.end();
}

run().catch((e) => { console.error(e); process.exit(1); });
