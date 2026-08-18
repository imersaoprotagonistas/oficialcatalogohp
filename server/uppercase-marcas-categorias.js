// Migração única: coloca todo marca/categoria já cadastrado em maiúscula (o cadastro novo já
// força isso no front — ver ProdutoForm/MarcasCategoriasModal em src/App.jsx — mas o que já
// existia no banco antes dessa regra ficou como foi digitado, com maiúscula/minúscula misturada).
// Uso: node uppercase-marcas-categorias.js  (dentro da pasta server/)
require("dotenv/config");
const { pool } = require("./db.js");

const TABELA_DO_CAMPO = { marca: "marcas", categoria: "categorias" };

// As tabelas marcas/categorias têm "nome" como chave primária exata (case-sensitive) — se
// "Colageno" e "COLAGENO" já existem como duas linhas separadas, um UPDATE em massa pra
// maiúscula bateria os dois na mesma chave e violaria a PK. Por isso trata cada grupo (mesmo
// nome em maiúscula) na mão: reaproveita a linha maiúscula se já existir, senão renomeia a
// primeira variante encontrada; o resto das variantes é removido.
async function normalizarTabela(campo) {
  const tabela = TABELA_DO_CAMPO[campo];
  const { rows } = await pool.query(`select nome from ${tabela} order by nome`);
  const porMaiuscula = new Map();
  for (const { nome } of rows) {
    const chave = nome.toUpperCase();
    if (!porMaiuscula.has(chave)) porMaiuscula.set(chave, []);
    porMaiuscula.get(chave).push(nome);
  }
  let renomeados = 0, removidos = 0;
  for (const [maiuscula, variantes] of porMaiuscula) {
    if (variantes.length === 1 && variantes[0] === maiuscula) continue; // já está certo
    if (variantes.includes(maiuscula)) {
      for (const v of variantes) {
        if (v === maiuscula) continue;
        await pool.query(`delete from ${tabela} where nome = $1`, [v]);
        removidos++;
      }
    } else {
      await pool.query(`update ${tabela} set nome = $1 where nome = $2`, [maiuscula, variantes[0]]);
      renomeados++;
      for (const v of variantes.slice(1)) {
        await pool.query(`delete from ${tabela} where nome = $1`, [v]);
        removidos++;
      }
    }
    console.log(`  ${tabela}: ${variantes.join(" / ")}  →  ${maiuscula}`);
  }
  return { renomeados, removidos };
}

async function main() {
  for (const campo of Object.keys(TABELA_DO_CAMPO)) {
    console.log(`\n== ${campo} ==`);

    // 1) produtos.<campo> — sem restrição de unicidade, então dá pra fazer tudo numa query só.
    const { rowCount } = await pool.query(
      `update produtos set ${campo} = upper(${campo}) where ${campo} is not null and ${campo} <> upper(${campo})`
    );
    console.log(`  produtos.${campo}: ${rowCount} produto(s) atualizado(s) pra maiúscula.`);

    // 2) tabela de cadastro (marcas/categorias) — precisa fundir duplicata por maiúscula/minúscula.
    const { renomeados, removidos } = await normalizarTabela(campo);
    console.log(`  ${TABELA_DO_CAMPO[campo]}: ${renomeados} renomeado(s), ${removidos} duplicata(s) removida(s).`);
  }
  console.log("\nPronto.");
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
