// Popula produtos e consultores iniciais no Supabase (mesmos dados que antes viviam
// em SEED_PRODUTOS / SEED_CONSULTORES no localStorage). Rode com: npm run seed
import "dotenv/config";
import { pool } from "./db.js";
import { hashSenha } from "./auth.js";

const PRODUTOS = [
  { id: "p1", nome: "Whey Protein Concentrado", gramatura: "900g", categoria: "Proteínas",
    descricao: "Alto teor proteico, vários sabores.", emoji: "🥤", ativo: true,
    marca: "Bold", sabores: ["Chocolate", "Baunilha", "Cookies", "Morango"], custo: 95, badges: ["marca_exclusiva"], notaPromo: "",
    precos: { primeira: { de: 169.9, desconto: 0, parcelado: 169.9, vista: 149.9 }, farm: { de: 169.9, desconto: 11.77, parcelado: 149.9, vista: 134.9 } } },
  { id: "p2", nome: "Creatina Monohidratada", gramatura: "300g", categoria: "Creatina",
    descricao: "100% pura, sem sabor.", emoji: "⚡", ativo: true,
    marca: "Synthe Size", sabores: ["Sem sabor"], custo: 55, badges: ["mais_vendido", "oferta"], notaPromo: "Leve 6 un. e ganhe material de PDV",
    precos: { primeira: { de: 99.9, desconto: 0, parcelado: 99.9, vista: 89.9 }, farm: { de: 99.9, desconto: 10.01, parcelado: 89.9, vista: 79.9 } } },
  { id: "p3", nome: "BCAA 2:1:1", gramatura: "250g", categoria: "Aminoácidos",
    descricao: "Recuperação muscular, sabor limão.", emoji: "🍋", ativo: true,
    marca: "Pure Life", sabores: ["Limão"], custo: 40, badges: [], notaPromo: "",
    precos: { primeira: { de: 0, desconto: 0, parcelado: 79.9, vista: 69.9 }, farm: { de: 0, desconto: 0, parcelado: 69.9, vista: 59.9 } } },
  { id: "p4", nome: "Multivitamínico", gramatura: "60 cápsulas", categoria: "Vitaminas",
    descricao: "Complexo vitamínico completo.", emoji: "💊", ativo: true,
    marca: "Vindix", sabores: [], custo: 30, badges: ["marca_exclusiva"], notaPromo: "",
    precos: { primeira: { de: 69.9, desconto: 7.15, parcelado: 64.9, vista: 54.9 }, farm: { de: 69.9, desconto: 21.46, parcelado: 54.9, vista: 44.9 } } },
  { id: "p5", nome: "Pré-treino Insano", gramatura: "300g", categoria: "Pré-treino",
    descricao: "Energia e foco, sabor tangerina.", emoji: "🔥", ativo: true,
    marca: "Caffeine Army", sabores: ["Tangerina"], custo: 75, badges: ["lancamento"], notaPromo: "Lançamento com preço de entrada",
    precos: { primeira: { de: 139.9, desconto: 3.57, parcelado: 134.9, vista: 119.9 }, farm: { de: 139.9, desconto: 14.30, parcelado: 119.9, vista: 104.9 } } },
  { id: "p6", nome: "Barra Proteica", gramatura: "45g · cx c/ 12", categoria: "Snacks",
    descricao: "Barra de proteína, sabor cookies.", emoji: "🍫", ativo: true,
    marca: "Evorox", sabores: ["Cookies"], custo: 50, badges: ["oferta"], notaPromo: "Compre 3 caixas, leve brinde",
    precos: { primeira: { de: 99.9, desconto: 5.01, parcelado: 94.9, vista: 84.9 }, farm: { de: 99.9, desconto: 15.02, parcelado: 84.9, vista: 74.9 } } },
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
      `insert into produtos (id, nome, gramatura, categoria, descricao, emoji, ativo, marca, sabores, custo, badges, nota_promo, precos)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       on conflict (id) do nothing`,
      [p.id, p.nome, p.gramatura, p.categoria, p.descricao, p.emoji, p.ativo, p.marca, JSON.stringify(p.sabores), p.custo,
        JSON.stringify(p.badges), p.notaPromo, JSON.stringify(p.precos)]
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
