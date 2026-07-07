// Importa os produtos da planilha "BANCO DE PRODUTOS" (CSV + custos passados por fora).
// Preço De/Por é o mesmo nos setores farm e primeira (decisão do usuário); a "vista" segue
// a mesma regra do app: vista = por - 3% (ver calcularPrecoSetor em src/App.jsx).
// Rode com: node import-produtos-csv.js
require("dotenv/config");
const { randomUUID } = require("crypto");
const { pool } = require("./db.js");

function round2(n) { return Math.round((Number(n) || 0) * 100) / 100; }

function precoSetor(de, desconto, custo) {
  const valorDesconto = round2(de * (desconto / 100));
  const por = round2(de - valorDesconto);
  const vista = round2(por - round2(por * 0.03));
  return { de: round2(de), desconto, parcelado: por, vista };
}

// marca, nome, sabores, gramatura, categoria, de, desconto%, custo
const PRODUTOS = [
  ["VITAFOR", "Refil Whey Protein", ["Baunilhas", "Mochaccino", "Cookies & Cream", "Neutro", "Frutas Vermelhas", "Chocolate", "Banana", "Paçoca"], "900g", "Proteínas", 149.30, 11.00, 87.60],
  ["INTEGRAL MEDICA", "Refil Whey 100%", ["Baunilhas", "Cookies & Cream", "Chocolate", "Morango", "Gelato di Latte"], "900g", "Proteínas", 141.90, 4.95, 96.76],
  ["EVOROX NUTRITION", "Whey Protein EvoWhey Refil", ["Chocolate", "Cookies", "Baunilha"], "1kg", "Proteínas", 125.90, 13.00, 79.90],
  ["BLACK SKUL", "Refil Whey 100%", ["Baunilha", "Morango", "Chocolate", "Cookies", "Torta de Limão", "Pistache", "Capuccino", "Milho Verde", "Caramelo Macchiato", "Vitamina de Frutas", "Choc Amendoim"], "900g", "Proteínas", 123.55, 7.00, 82.42],
  ["VINDIX", "Noble Purity Whey", ["Milk", "Velvet Supreme", "Maracujá", "Banana Ice Cream"], "1kg", "Proteínas", 106.13, 7.00, 67.17],
  ["VINDIX", "Noble Purity Whey", ["Chocolate"], "1kg", "Proteínas", 106.13, 17.50, 67.17],
  ["EVOROX NUTRITION", "Refil Whey 100%", ["Morango", "Baunilha", "Chocolate"], "900g", "Proteínas", 93.97, 5.45, 61.45],
  ["EVOROX NUTRITION", "Creatina Monohidratada Micronizada", [], "300g", "Creatina", 44.23, 7.01, 26.02],
  ["PROBIOTICA", "Creatina Monohidratada Pura", [], "300g", "Creatina", 42.01, 7.00, 27.52],
  ["DUX", "Creatina Monohidratada", [], "300g", "Creatina", 68.90, 13.06, 41.83],
  ["INTEGRAL MEDICA", "Creatina", [], "300g", "Creatina", 46.90, 4.99, 31.96],
  ["NEWM MILLEN", "Overkill", ["Maça Verde", "Melancia", "Limonada Suiça"], "200g", "Pré-treino", 80.30, 6.00, 53.63],
  ["NEWM MILLEN", "C4 Black Beta Pump", ["Crazy Mango"], "22 sachê", "Pré-treino", 90.20, 8.00, 56.73],
  ["NEWM MILLEN", "C4 Beta Pump", ["Limão", "Maça Verde", "Melancia", "Tangerina", "Frutas Amarelas", "Açaí com Guaraná", "Amora"], "225g", "Pré-treino", 67.39, 7.00, 39.45],
  ["NEWM MILLEN", "C4 Sem Cafeína", ["Todos os sabores"], "220g", "Pré-treino", 57.18, 7.00, 35.01],
  ["VITAFOR", "Enzyfor", [], "30 sachê", "Enzimas Digestivas", 131.97, 11.62, 82.59],
  ["VITAFOR", "D3 Suplemento de Vitamina", [], "60 cáps", "Vitaminas", 49.90, 10.00, 32.12],
  ["VITAFOR", "NAC Acetil Cisteína", [], "30 cáps", "Vitaminas", 43.32, 11.61, 27.11],
  ["VITAFOR", "Curcuma Plus", [], "60 cáps", "Vitaminas", 74.90, 10.00, 47.41],
  ["VITAFOR", "L Carnitina", [], "60 cáps", "Emagrecedor", 59.32, 11.61, 37.12],
  ["VITAFOR", "Colagentek Tipo II", [], "60 cáps", "Colágeno", 93.90, 10.00, 60.06],
  ["VINDIX", "Moro Slim Lipo Day", [], "60 cáps", "Termogênico", 55.90, 3.58, 37.30],
  ["EVOROX NUTRITION", "Termogênico Derrete", [], "60 cáps", "Termogênico", 51.90, 11.54, 17.94],
  ["VINDIX", "Stanonadrol", [], "120 cáps", "Hormonal", 67.90, 7.36, 44.60],
  ["EVOROX NUTRITION", "Evo Cuts", ["Abacaxi com Hortelã", "Tangerina"], "210g", "Termogênico", 60.95, 5.00, 28.40],
];

async function importar() {
  let inseridos = 0, pulados = 0;
  for (const [marca, nome, sabores, gramatura, categoria, de, desconto, custo] of PRODUTOS) {
    const existente = await pool.query(
      "select id from produtos where lower(marca) = lower($1) and lower(nome) = lower($2) and gramatura = $3",
      [marca, nome, gramatura]
    );
    if (existente.rows.length) { pulados++; continue; }

    const precoFarm = precoSetor(de, desconto, custo);
    const precos = { primeira: precoFarm, farm: precoFarm };

    await pool.query(
      `insert into produtos (id, nome, gramatura, categoria, ativo, marca, sabores, custo, badges, precos)
       values ($1,$2,$3,$4,true,$5,$6,$7,'[]',$8)`,
      [randomUUID(), nome, gramatura, categoria, marca, JSON.stringify(sabores), custo, JSON.stringify(precos)]
    );
    inseridos++;
  }
  console.log(`Importação concluída: ${inseridos} produtos inseridos, ${pulados} já existiam e foram ignorados.`);
  await pool.end();
}

importar().catch((e) => { console.error(e); process.exit(1); });
