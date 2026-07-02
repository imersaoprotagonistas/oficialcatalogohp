// Popula produtos e consultores iniciais no Supabase (mesmos dados que antes viviam
// em SEED_PRODUTOS / SEED_CONSULTORES no localStorage). Rode com: npm run seed
import "dotenv/config";
import { pool } from "./db.js";
import { hashSenha } from "./auth.js";

const PRODUTOS = [
  { id: "p1", nome: "Whey Protein Concentrado", gramatura: "900g", categoria: "Proteínas",
    descricao: "Alto teor proteico, sabor chocolate.", emoji: "🥤", ativo: true,
    marca: "Bold", precoDe: 169.9, badges: ["marca_exclusiva"], notaPromo: "",
    precos: { primeira: { vista: 149.9, parcelado: 169.9 }, farm: { vista: 134.9, parcelado: 149.9 } } },
  { id: "p2", nome: "Creatina Monohidratada", gramatura: "300g", categoria: "Creatina",
    descricao: "100% pura, sem sabor.", emoji: "⚡", ativo: true,
    marca: "Synthe Size", precoDe: 99.9, badges: ["mais_vendido", "oferta"], notaPromo: "Leve 6 un. e ganhe material de PDV",
    precos: { primeira: { vista: 89.9, parcelado: 99.9 }, farm: { vista: 79.9, parcelado: 89.9 } } },
  { id: "p3", nome: "BCAA 2:1:1", gramatura: "250g", categoria: "Aminoácidos",
    descricao: "Recuperação muscular, sabor limão.", emoji: "🍋", ativo: true,
    marca: "Pure Life", precoDe: 0, badges: [], notaPromo: "",
    precos: { primeira: { vista: 69.9, parcelado: 79.9 }, farm: { vista: 59.9, parcelado: 69.9 } } },
  { id: "p4", nome: "Multivitamínico", gramatura: "60 cápsulas", categoria: "Vitaminas",
    descricao: "Complexo vitamínico completo.", emoji: "💊", ativo: true,
    marca: "Vindix", precoDe: 69.9, badges: ["marca_exclusiva"], notaPromo: "",
    precos: { primeira: { vista: 54.9, parcelado: 64.9 }, farm: { vista: 44.9, parcelado: 54.9 } } },
  { id: "p5", nome: "Pré-treino Insano", gramatura: "300g", categoria: "Pré-treino",
    descricao: "Energia e foco, sabor tangerina.", emoji: "🔥", ativo: true,
    marca: "Caffeine Army", precoDe: 139.9, badges: ["lancamento"], notaPromo: "Lançamento com preço de entrada",
    precos: { primeira: { vista: 119.9, parcelado: 134.9 }, farm: { vista: 104.9, parcelado: 119.9 } } },
  { id: "p6", nome: "Barra Proteica", gramatura: "45g · cx c/ 12", categoria: "Snacks",
    descricao: "Barra de proteína, sabor cookies.", emoji: "🍫", ativo: true,
    marca: "Evorox", precoDe: 99.9, badges: ["oferta"], notaPromo: "Compre 3 caixas, leve brinde",
    precos: { primeira: { vista: 84.9, parcelado: 94.9 }, farm: { vista: 74.9, parcelado: 84.9 } } },
];

const WHATSAPP_TESTE = "5585985175032";
const FUNCIONARIOS_FARM = ["Maycon", "Janderson", "Thayrlla", "Giovanna", "Alef", "Caio", "Valesca", "Sangela"];
const CONSULTORES = [
  ...FUNCIONARIOS_FARM.map((nome, i) => ({
    id: `farm${i + 1}`, nome,
    email: `${nome.toLowerCase()}@hpdistribuidora.com.br`,
    whatsapp: WHATSAPP_TESTE, setor: "farm", senha: "1234",
  })),
  { id: "primeira1", nome: "Aline", email: "aline@hpdistribuidora.com.br",
    whatsapp: WHATSAPP_TESTE, setor: "primeira", senha: "1234" },
];

async function seed() {
  for (const p of PRODUTOS) {
    await pool.query(
      `insert into produtos (id, nome, gramatura, categoria, descricao, emoji, ativo, marca, preco_de, badges, nota_promo, precos)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       on conflict (id) do nothing`,
      [p.id, p.nome, p.gramatura, p.categoria, p.descricao, p.emoji, p.ativo, p.marca,
        p.precoDe, JSON.stringify(p.badges), p.notaPromo, JSON.stringify(p.precos)]
    );
  }

  for (const c of CONSULTORES) {
    const senhaHash = await hashSenha(c.senha);
    await pool.query(
      `insert into consultores (id, nome, email, whatsapp, setor, senha_hash) values ($1,$2,$3,$4,$5,$6)
       on conflict (id) do nothing`,
      [c.id, c.nome, c.email, c.whatsapp, c.setor, senhaHash]
    );
  }

  console.log(`Seed concluído: ${PRODUTOS.length} produtos, ${CONSULTORES.length} consultores (senha padrão: 1234).`);
  await pool.end();
}

seed().catch((e) => { console.error(e); process.exit(1); });
