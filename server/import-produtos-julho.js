// Importa os produtos da planilha "produtos_julho_organizados.csv".
// Diferente do primeiro lote, este CSV já traz custo, de, por e à vista prontos
// (sem precisar recalcular o 3% à vista) — uso os valores exatamente como vieram.
// Preço De/Por/À vista é o mesmo nos setores farm e primeira (mesma decisão do lote anterior).
// Rode com: node import-produtos-julho.js
require("dotenv/config");
const { randomUUID } = require("crypto");
const { pool } = require("./db.js");

function round2(n) { return Math.round((Number(n) || 0) * 100) / 100; }

function precoSetor(de, por, vista) {
  const deN = round2(de);
  const desconto = deN > 0 ? round2(((deN - por) / deN) * 100) : 0;
  return { de: deN, desconto, parcelado: round2(por), vista: round2(vista) };
}

// marca, nome, sabores, gramatura, categoria, de, por, custo, vista
const PRODUTOS = [
  ["ABSOLUT NUTRITION", "Hit Protein", ["Maçã Verde"], "420g", "Pré-treino", 99.90, 75.92, 55, 73.65],
  ["INTEGRAL MEDICA", "Creatina 100% Pura Hardcore", [], "300g", "Creatina", 49.90, 43.41, 33, 42.11],
  ["INTEGRAL MEDICA", "Creatina Hardcore", ["Limão", "Morango"], "350g", "Creatina", 49.90, 43.41, 33, 42.11],
  ["INTEGRAL MEDICA", "Beta Alanina em Pó", ["Neutro"], "123g", "Aminoácidos", 43.02, 40.44, 29.21, 39.23],
  ["INTEGRAL MEDICA", "Protein Crisp Bar", ["Ovomaltine"], "45g", "Snacks", 89.90, 84.51, 61.69, 81.97],
  ["INTEGRAL MEDICA", "Protein Crisp Bar", ["Trufa de Avelã", "Peanut Butter", "Churros com Doce de Leite", "Doce de Coco", "Leite com Creme de Avelã", "Cookies and Cream", "Duo Crunch"], "45g", "Snacks", 89.90, 84.51, 61.69, 81.97],
  ["DARKNESS", "Évora XT", ["Neon Berry", "Orange Storm", "Bloody Berry"], "300g", "Pré-treino", 94.40, 72.69, 48.66, 70.51],
  ["NEW MILLEN", "Isolate Protein", ["Chocolate", "Morango", "Pêssego e Manga", "Abacaxi com Hortelã", "Orange Juice", "Maçã Verde", "Tangerina com Morango", "Maracujá"], "900g", "Proteínas", 126.22, 117.38, 80.43, 113.86],
  ["NEW MILLEN", "Mass Complex Pouch", ["Baunilha", "Chocolate", "Cookies e Cream", "Morango"], "3kg", "Hipercalórico", 57.88, 56.14, 39.48, 54.46],
  ["NEW MILLEN", "Agent Orange Drink", ["Tangerina com Morango", "Limão com Hortelã", "Frutas Tropicais", "Maçã Verde"], "269ml", "Termogênico", 7.03, 6.68, 4.32, 6.48],
  ["BLACK SKULL", "Bope", ["Frutas Amarelas", "Limão", "Frutas Vermelhas"], "150g", "Pré-treino", 31.04, 29.49, 19.22, 28.60],
  ["BLACK SKULL", "Creatina Monohidratada", [], "500g", "Creatina", 67.51, 65.48, 46, 63.52],
  ["BLACK SKULL", "Thermo Flame", [], "120 cáps", "Termogênico", 39.99, 39.19, 27.47, 38.01],
  ["VEGETAL LABS", "Ashwagandha", [], "60 cáps", "Fitoterápicos", 42.60, 41.32, 30, 40.08],
  ["VEGETAL LABS", "Chlorella", [], "60 cáps", "Fitoterápicos", 29.68, 28.79, 20.90, 27.93],
  ["VEGETAL LABS", "Sangue de Leão", ["Catuaba"], "450ml", "Hormonal", 70.86, 68.73, 49.90, 66.67],
  ["VINDIX", "Tribulus", [], "60 cáps", "Hormonal", 49.90, 47.90, 33, 46.47],
  ["VINDIX", "Dilassany", [], "60 cáps", "Hormonal", 45.90, 44.06, 27.81, 42.74],
  ["VINDIX", "Tribulus + Feno Grego", [], "120 cáps", "Hormonal", 59.90, 57.50, 35.01, 55.78],
  ["EVOROX", "Ultramag", [], "60 cáps", "Vitaminas", 48.90, 46.94, 19.31, 45.54],
  ["EVOROX", "Omega", [], "90 cáps", "Vitaminas", 82.90, 79.58, 53, 77.20],
  ["EVOROX", "Beta Alanina", [], "150g", "Aminoácidos", 39.73, 36.95, 15.72, 35.84],
  ["MAX TITANIUM", "Horus Gel", ["Frutas Vermelhas", "Tipo Energético"], "10 sachês", "Pré-treino", 34.65, 33.61, 24.51, 32.60],
  ["SUDRACT", "Pro Gel", ["Água de Coco", "Banana com Açaí", "Laranja", "Limão", "Morango com Maracujá"], "10 sachês", "Aminoácidos", 36.63, 35.53, 26.90, 34.47],
  ["MOVING", "Juice Protein", ["Laranja", "Maçã", "Uva"], "300ml", "Aminoácidos", 8.70, 7.40, 4.79, 7.17],
  ["MOVING", "Hidro", ["Limão", "Melancia e Limão", "Tangerina", "Uva"], "500ml", "Aminoácidos", 9.44, 8.02, 5.20, 7.78],
];

async function importar() {
  // Snapshot tirado uma vez só, antes do loop — assim duas linhas deste próprio arquivo
  // com a mesma marca+nome+gramatura (ex: Protein Crisp Bar em dois sabores diferentes)
  // não se confundem uma com a outra durante a importação.
  const existentes = await pool.query("select marca, nome, gramatura from produtos");
  const chavesExistentes = new Set(existentes.rows.map((r) => `${(r.marca || "").toLowerCase()}|${r.nome.toLowerCase()}|${r.gramatura}`));

  let inseridos = 0, pulados = 0;
  for (const [marca, nome, sabores, gramatura, categoria, de, por, custo, vista] of PRODUTOS) {
    const chave = `${marca.toLowerCase()}|${nome.toLowerCase()}|${gramatura}`;
    if (chavesExistentes.has(chave)) { pulados++; continue; }

    const preco = precoSetor(de, por, vista);
    const precos = { primeira: preco, farm: preco };

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
