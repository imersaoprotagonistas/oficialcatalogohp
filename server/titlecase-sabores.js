// Migração única: normaliza todo sabor já cadastrado pra "Primeira Letra De Cada Palavra
// Maiúscula, resto minúsculo" (o cadastro novo já força isso no front — ver tituloCase/
// ProdutoForm em src/App.jsx — mas o que já existia no banco ficou como foi digitado, com
// maiúscula/minúscula misturada, e por isso o mesmo sabor virava duas entradas diferentes no
// filtro "Todos os produtos" do catálogo).
//
// Sabor não é um cadastro à parte (não tem tabela própria, diferente de marca/categoria) — mora
// em três lugares que dependem do MESMO texto pra continuar batendo entre si:
//   produtos.sabores      — array de strings
//   produtos.variacoes    — objeto { "<sabor>": { custo, precos } }, chave = sabor
//   catalogos.itens[].precosPorSabor — objeto { "<sabor>": { precoDe, precoParcelado, precoVista } },
//                            preço por sabor congelado num catálogo específico
// Renomear o sabor num produto sem renomear a chave correspondente em variacoes/precosPorSabor
// faria esse preço por sabor "sumir" silenciosamente (deixa de casar com o sabor renomeado e
// cai no preço geral do produto) — por isso os três são corrigidos juntos aqui.
//
// Uso: node titlecase-sabores.js  (dentro da pasta server/)
require("dotenv/config");
const { pool } = require("./db.js");

function tituloCase(str) {
  return (str || "").trim().toLowerCase().replace(/(^|\s)(\p{L})/gu, (m) => m.toUpperCase());
}

async function normalizarProdutos() {
  const { rows } = await pool.query("select id, sabores, variacoes from produtos");
  // produtoId -> Map(sabor antigo -> sabor novo), só entra quem de fato mudou — usado depois
  // pra corrigir os catálogos que já congelaram preço em cima do sabor antigo.
  const renomeacoesPorProduto = new Map();
  let produtosAtualizados = 0;

  for (const p of rows) {
    const saboresAtuais = p.sabores || [];
    if (saboresAtuais.length === 0) continue;

    const renomeacoes = new Map(); // sabor antigo -> sabor novo (só os que mudaram)
    const novosSabores = [];
    const vistos = new Set(); // detecta colisão: duas grafias do produto virando o mesmo título
    for (const atual of saboresAtuais) {
      const novo = tituloCase(atual);
      if (novo !== atual) renomeacoes.set(atual, novo);
      if (!vistos.has(novo)) { vistos.add(novo); novosSabores.push(novo); }
    }
    if (renomeacoes.size === 0 && novosSabores.length === saboresAtuais.length) continue; // nada mudou

    // variacoes: refaz o objeto trocando cada chave pelo título novo — colisão (duas chaves
    // antigas caindo no mesmo título) mantém a primeira encontrada e avisa no log, pra revisão manual.
    const variacoesAtuais = p.variacoes || {};
    const novasVariacoes = {};
    for (const [saborAntigo, valor] of Object.entries(variacoesAtuais)) {
      const chaveNova = tituloCase(saborAntigo);
      if (novasVariacoes[chaveNova] !== undefined) {
        console.warn(`  ! produto ${p.id}: variações de "${saborAntigo}" e outro sabor colidiram em "${chaveNova}" — mantida a primeira, confira manualmente.`);
        continue;
      }
      novasVariacoes[chaveNova] = valor;
    }

    await pool.query("update produtos set sabores = $1, variacoes = $2 where id = $3", [
      JSON.stringify(novosSabores), JSON.stringify(novasVariacoes), p.id,
    ]);
    produtosAtualizados++;
    if (renomeacoes.size > 0) {
      renomeacoesPorProduto.set(p.id, renomeacoes);
      for (const [de, para] of renomeacoes) console.log(`  produto ${p.id}: "${de}" → "${para}"`);
    }
  }
  return { produtosAtualizados, renomeacoesPorProduto };
}

async function normalizarCatalogos(renomeacoesPorProduto) {
  if (renomeacoesPorProduto.size === 0) return 0;
  const { rows } = await pool.query("select id, itens from catalogos");
  let catalogosAtualizados = 0;

  for (const cat of rows) {
    let mudou = false;
    const novosItens = (cat.itens || []).map((item) => {
      const renomeacoes = renomeacoesPorProduto.get(item.produtoId);
      if (!renomeacoes || !item.precosPorSabor) return item;
      const novoPrecosPorSabor = {};
      for (const [saborAntigo, valor] of Object.entries(item.precosPorSabor)) {
        const chaveNova = renomeacoes.get(saborAntigo) || saborAntigo;
        novoPrecosPorSabor[chaveNova] = valor;
      }
      mudou = true;
      return { ...item, precosPorSabor: novoPrecosPorSabor };
    });
    if (!mudou) continue;
    await pool.query("update catalogos set itens = $1 where id = $2", [JSON.stringify(novosItens), cat.id]);
    catalogosAtualizados++;
  }
  return catalogosAtualizados;
}

async function main() {
  console.log("Normalizando produtos.sabores / produtos.variacoes...");
  const { produtosAtualizados, renomeacoesPorProduto } = await normalizarProdutos();
  console.log(`${produtosAtualizados} produto(s) atualizado(s).`);

  console.log("\nCorrigindo catalogos.itens[].precosPorSabor que dependiam do sabor renomeado...");
  const catalogosAtualizados = await normalizarCatalogos(renomeacoesPorProduto);
  console.log(`${catalogosAtualizados} catálogo(s) atualizado(s).`);

  console.log("\nPronto.");
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
