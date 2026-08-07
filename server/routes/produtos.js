const { Router } = require("express");
const { randomUUID, createHash } = require("crypto");
const { pool } = require("../db.js");
const { requireAuth, optionalAuth } = require("../middleware/requireAuth.js");
const { ah } = require("../asyncHandler.js");

const router = Router();

// A foto vai em base64 dentro da coluna "imagem" (até 15mb, ver server/app.js). Embutir isso
// em toda listagem deixava o catálogo público baixando ~40mb só de fotos antes de mostrar
// qualquer produto. Agora a listagem só diz "temImagem" e a foto em si sai por uma rota própria
// (/:id/imagem), servida como imagem de verdade — o navegador cacheia e carrega sob demanda.
// custo é dado sensível — só sai pra quem loga como compras ou como gerente comercial.
// Decisão de negócio (antes o gerente comercial não tinha acesso a isso, ver histórico de
// commits): agora ele também precisa mexer no custo, então entra na mesma lista de Compras.
// variacoes = preço/custo por sabor (override opcional — sabor sem entrada aqui usa custo/precos
// gerais do produto, ver comentário em schema.sql). custo de cada sabor é dado sensível igual ao
// custo geral: só sai pra quem loga como compras ou gerente comercial (mesma regra de "incluirCusto").
function montarVariacoesResposta(variacoes, incluirCusto) {
  const out = {};
  for (const [sabor, v] of Object.entries(variacoes || {})) {
    out[sabor] = { precos: v?.precos || {} };
    if (incluirCusto) out[sabor].custo = v?.custo === null || v?.custo === undefined ? 0 : Number(v.custo);
  }
  return out;
}

function toRow(p, incluirCusto) {
  const row = {
    id: p.id,
    nome: p.nome,
    gramatura: p.gramatura,
    categoria: p.categoria,
    descricao: p.descricao,
    emoji: p.emoji,
    temImagem: p.tem_imagem ?? !!p.imagem,
    ativo: p.ativo,
    marca: p.marca,
    sabores: p.sabores || [], // array de sabores disponíveis, ex: ["Chocolate","Baunilha"]
    badges: p.badges,
    precos: p.precos, // { primeira: {...}, farm: {...}, tabelado: { de, por } } — tabelado só tem UI no Compras (src/App.jsx)
    variacoes: montarVariacoesResposta(p.variacoes, incluirCusto),
  };
  if (incluirCusto) row.custo = p.custo === null ? 0 : Number(p.custo);
  return row;
}

// Não seleciona a coluna "imagem" aqui: além de não ir pro cliente, evita puxar ~40mb de base64
// do Postgres pro servidor a cada listagem só pra descartar em seguida.
router.get("/", optionalAuth, ah(async (req, res) => {
  const { rows } = await pool.query(
    `select id, nome, gramatura, categoria, descricao, emoji, (imagem is not null) as tem_imagem,
       ativo, marca, sabores, custo, badges, precos, variacoes
     from produtos order by nome`
  );
  const incluirCusto = ["compras", "gerente"].includes(req.user?.role);
  res.json(rows.map((p) => toRow(p, incluirCusto)));
}));

// Serve a foto de verdade (não o JSON) a partir do data URL salvo em "imagem", com cache no
// navegador — sobrescreve o no-store global (server/app.js) só pra esta rota. O ETag é um hash
// do conteúdo, então trocar a foto muda o ETag e o navegador busca a versão nova na hora —
// antes era "public, max-age=86400" sem validação, e a foto trocada só aparecia depois de 24h.
router.get("/:id/imagem", ah(async (req, res) => {
  const { rows } = await pool.query("select imagem from produtos where id = $1", [req.params.id]);
  const dataUrl = rows[0]?.imagem;
  const m = dataUrl && dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!m) return res.status(404).end();
  const etag = `"${createHash("sha1").update(dataUrl).digest("hex")}"`;
  res.set("Cache-Control", "no-cache");
  res.set("ETag", etag);
  if (req.headers["if-none-match"] === etag) return res.status(304).end();
  res.set("Content-Type", m[1]);
  res.send(Buffer.from(m[2], "base64"));
}));

// Cadastro/edição de produto: Compras é quem cuida disso no dia a dia, mas o setor é novo na
// empresa e ainda está aprendendo — o gerente comercial cadastra/edita como reforço enquanto
// isso não muda. Custo: só quem tem "livre acesso" (gerente comercial e gerente de compras)
// pode alterar; um comprador comum só é barrado se tentar mudar o valor que já via.
function calcularCusto(req, custoAtual) {
  const b = req.body || {};
  if (req.user.role === "gerente" || req.user.ehGerente) return { custo: Number(b.custo) || 0, erro: null };
  // comprador comum: só passa se não estiver tentando mudar o valor que já via.
  const tentativa = Number(b.custo) || 0;
  if (tentativa !== custoAtual) {
    return { custo: null, erro: "Somente o gerente de compras pode alterar o custo do produto." };
  }
  return { custo: tentativa, erro: null };
}

// Mesma regra do custo geral acima, só que por sabor: comprador comum só passa se não mexer no
// custo que já via pra aquele sabor específico; quem tem livre acesso (gerente comercial e
// gerente de compras) pode alterar à vontade. "precos" de cada sabor (usado no catálogo/carrinho
// do cliente, ver src/App.jsx) não tem essa restrição — só o custo é dado sensível.
// variacoesAtuais vem do produto já salvo (ou {} num produto novo); variacoesRecebidas vem do
// corpo da requisição. Sabor que não veio no corpo simplesmente não entra no resultado — é assim
// que remover a variação de um sabor funciona (o form só manda o que ainda existe).
function calcularVariacoes(req, variacoesRecebidas, variacoesAtuais) {
  const podeAlterarCusto = req.user.role === "gerente" || req.user.ehGerente;
  const resultado = {};
  for (const [sabor, v] of Object.entries(variacoesRecebidas || {})) {
    const custoAtual = Number(variacoesAtuais?.[sabor]?.custo) || 0;
    const custoTentativa = Number(v?.custo) || 0;
    if (!podeAlterarCusto && custoTentativa !== custoAtual) {
      return { variacoes: null, erro: `Somente o gerente de compras pode alterar o custo do sabor "${sabor}".` };
    }
    resultado[sabor] = { custo: podeAlterarCusto ? custoTentativa : custoAtual, precos: v?.precos || {} };
  }
  return { variacoes: resultado, erro: null };
}

// marca/categoria são cadastros de verdade (tabelas marcas/categorias — ver schema.sql), não só
// "o que já apareceu em algum produto". "campo" nunca vem do usuário — é sempre "marca" ou
// "categoria", chamado fixo abaixo; TABELA_DO_CAMPO é a única ponte entre esse texto e o nome
// real da tabela, pra nunca interpolar algo vindo de req direto num identificador SQL.
const TABELA_DO_CAMPO = { marca: "marcas", categoria: "categorias" };
const CAMPOS_GERENCIAVEIS = new Set(Object.keys(TABELA_DO_CAMPO));

// Não deixa duplicar por maiúscula/minúscula (ex: "Synthesize" e "SYNTHESIZE" não são duas
// marcas diferentes): reaproveita a grafia já cadastrada pro mesmo valor (case-insensitive) em
// vez de criar uma variação nova. Se o valor nunca foi visto, cadastra ele agora mesmo — é
// assim que digitar uma marca nova no cadastro de produto já "cria" ela pra sempre.
async function canonizarValor(campo, valor) {
  const limpo = (valor || "").trim();
  if (!limpo) return limpo;
  const tabela = TABELA_DO_CAMPO[campo];
  const { rows } = await pool.query(`select nome from ${tabela} where lower(nome) = lower($1) limit 1`, [limpo]);
  if (rows[0]) return rows[0].nome;
  await pool.query(`insert into ${tabela} (nome) values ($1) on conflict (nome) do nothing`, [limpo]);
  return limpo;
}

// Histórico de criação/edição/exclusão — aba "Histórico" dentro do login de Compras, só pra
// quem tem eh_gerente=true (mesma regra de acesso da aba "Equipe", ver server/routes/
// compradores.js). Gerente comercial não tem conta individual (login único, sem id), então
// autor_id fica null e autor_nome vira um rótulo fixo — dá pra saber QUE foi o gerente
// comercial, só não QUAL (não existe "qual" nesse modelo de login).
async function registrarHistorico(req, produtoId, produtoNome, acao, detalhe) {
  const autorTipo = req.user.role === "compras" ? "compras" : "gerente";
  const autorId = req.user.role === "compras" ? req.user.id : null;
  const autorNome = req.user.role === "compras" ? (req.user.nome || "Comprador(a)") : "Gerente comercial";
  await pool.query(
    `insert into produtos_historico (id, produto_id, produto_nome, acao, autor_tipo, autor_id, autor_nome, detalhe)
     values ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [randomUUID(), produtoId, produtoNome, acao, autorTipo, autorId, autorNome, detalhe || null]
  );
}

// Resumo legível do que mudou numa edição — só os campos que importam pra auditoria (não lista
// preço/sabores em detalhe pra não virar um textão; o objetivo é "o que aconteceu", não um diff completo).
const formatBRLServer = (n) => `R$ ${(Number(n) || 0).toFixed(2).replace(".", ",")}`;
function resumoEdicao(antes, depois) {
  const partes = [];
  if (antes.nome !== depois.nome) partes.push(`nome "${antes.nome}" → "${depois.nome}"`);
  if (Number(antes.custo) !== Number(depois.custo)) partes.push(`custo ${formatBRLServer(antes.custo)} → ${formatBRLServer(depois.custo)}`);
  if (antes.marca !== depois.marca) partes.push(`marca "${antes.marca || "—"}" → "${depois.marca || "—"}"`);
  if (antes.ativo !== depois.ativo) partes.push(depois.ativo ? "reativado" : "desativado");
  return partes.length ? partes.join("; ") : null;
}

router.post("/", requireAuth(["compras", "gerente"]), ah(async (req, res) => {
  const b = req.body || {};
  const { custo, erro } = calcularCusto(req, 0);
  if (erro) return res.status(403).json({ erro });
  const { variacoes, erro: erroVariacoes } = calcularVariacoes(req, b.variacoes, {});
  if (erroVariacoes) return res.status(403).json({ erro: erroVariacoes });
  const marca = await canonizarValor("marca", b.marca);
  const categoria = await canonizarValor("categoria", b.categoria);
  const id = b.id || randomUUID();
  const { rows } = await pool.query(
    `insert into produtos (id, nome, gramatura, categoria, descricao, emoji, imagem, ativo, marca, sabores, custo, badges, precos, variacoes)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) returning *`,
    [id, b.nome, b.gramatura, categoria, b.descricao, b.emoji, b.imagem, b.ativo ?? true, marca,
      JSON.stringify(b.sabores || []), custo, JSON.stringify(b.badges || []), JSON.stringify(b.precos || {}), JSON.stringify(variacoes)]
  );
  await registrarHistorico(req, rows[0].id, rows[0].nome, "criado", null);
  res.status(201).json(toRow(rows[0], true)); // já passou por calcularCusto acima — sempre pode ver o que acabou de gravar
}));

router.put("/:id", requireAuth(["compras", "gerente"]), ah(async (req, res) => {
  const b = req.body || {};
  const { rows: atual } = await pool.query("select * from produtos where id=$1", [req.params.id]);
  if (!atual[0]) return res.status(404).json({ erro: "Produto não encontrado." });
  const { custo, erro } = calcularCusto(req, Number(atual[0].custo) || 0);
  if (erro) return res.status(403).json({ erro });
  const { variacoes, erro: erroVariacoes } = calcularVariacoes(req, b.variacoes, atual[0].variacoes);
  if (erroVariacoes) return res.status(403).json({ erro: erroVariacoes });
  const marca = await canonizarValor("marca", b.marca);
  const categoria = await canonizarValor("categoria", b.categoria);
  // imagem usa coalesce(nullif(...)): se o campo não vier (undefined -> null aqui) preserva a
  // foto atual em vez de apagá-la — mesma proteção que capa já tem em server/routes/catalogos.js.
  const { rows } = await pool.query(
    `update produtos set nome=$1, gramatura=$2, categoria=$3, descricao=$4, emoji=$5,
       imagem=coalesce($6, imagem), ativo=$7,
       marca=$8, sabores=$9, custo=$10, badges=$11, precos=$12, variacoes=$13
     where id=$14 returning *`,
    [b.nome, b.gramatura, categoria, b.descricao, b.emoji, b.imagem ?? null, b.ativo ?? true, marca,
      JSON.stringify(b.sabores || []), custo, JSON.stringify(b.badges || []), JSON.stringify(b.precos || {}),
      JSON.stringify(variacoes), req.params.id]
  );
  await registrarHistorico(req, rows[0].id, rows[0].nome, "editado", resumoEdicao(atual[0], rows[0]));
  res.json(toRow(rows[0], true)); // idem: já passou por calcularCusto, sempre pode ver o que acabou de gravar
}));

router.delete("/:id", requireAuth(["compras"]), ah(async (req, res) => {
  const { rows } = await pool.query("delete from produtos where id=$1 returning nome", [req.params.id]);
  if (rows[0]) await registrarHistorico(req, req.params.id, rows[0].nome, "excluido", null);
  res.status(204).end();
}));

// Só pra quem tem eh_gerente=true — o comprador comum não acompanha a equipe (mesma regra da
// aba "Equipe"). limit 500: histórico não tem paginação ainda, é uma trava simples pra não
// devolver um payload gigante depois de anos de uso.
router.get("/historico", requireAuth(["compras"]), ah(async (req, res) => {
  if (!req.user.ehGerente) return res.status(403).json({ erro: "Sem permissão." });
  const { rows } = await pool.query(
    `select id, produto_id, produto_nome, acao, autor_tipo, autor_id, autor_nome, detalhe, criado_em
     from produtos_historico order by criado_em desc limit 500`
  );
  res.json(rows.map((h) => ({
    id: h.id,
    produtoId: h.produto_id,
    produtoNome: h.produto_nome,
    acao: h.acao,
    autorTipo: h.autor_tipo,
    autorId: h.autor_id,
    autorNome: h.autor_nome,
    detalhe: h.detalhe,
    criadoEm: new Date(h.criado_em).getTime(),
  })));
}));

// Gerenciamento de marca/categoria: listar (com quantos produtos usam cada uma — inclui as que
// ainda têm zero produto, porque foram cadastradas mas ainda não usadas), criar (cadastra sem
// precisar de produto nenhum — é o que faltava antes), renomear (corrige duplicata por
// maiúscula/minúscula, ou só ajeita nome errado) e excluir (some com o cadastro e limpa o campo
// dos produtos que usavam esse valor). Todas exigem login — não tem uso público.
router.get("/campo/:campo", requireAuth(["compras", "gerente"]), ah(async (req, res) => {
  const { campo } = req.params;
  if (!CAMPOS_GERENCIAVEIS.has(campo)) return res.status(400).json({ erro: "Campo inválido." });
  const tabela = TABELA_DO_CAMPO[campo];
  const { rows } = await pool.query(
    `select t.nome, count(p.id)::int as qtd
     from ${tabela} t
     left join produtos p on lower(p.${campo}) = lower(t.nome)
     group by t.nome
     order by t.nome`
  );
  res.json(rows);
}));

router.post("/campo/:campo", requireAuth(["compras", "gerente"]), ah(async (req, res) => {
  const { campo } = req.params;
  if (!CAMPOS_GERENCIAVEIS.has(campo)) return res.status(400).json({ erro: "Campo inválido." });
  const nome = (req.body?.nome || "").trim();
  if (!nome) return res.status(400).json({ erro: "Informe um nome." });
  // canonizarValor já cadastra se for novo, ou devolve de volta a grafia existente — "criar"
  // uma marca que já existe não é erro, é só confirmar que ela já está lá.
  const nomeFinal = await canonizarValor(campo, nome);
  res.status(201).json({ nome: nomeFinal });
}));

router.patch("/campo/:campo", requireAuth(["compras", "gerente"]), ah(async (req, res) => {
  const { campo } = req.params;
  if (!CAMPOS_GERENCIAVEIS.has(campo)) return res.status(400).json({ erro: "Campo inválido." });
  const tabela = TABELA_DO_CAMPO[campo];
  const de = (req.body?.de || "").trim();
  const para = (req.body?.para || "").trim();
  if (!de || !para) return res.status(400).json({ erro: "Informe o valor atual e o novo nome." });
  // Se "para" já bater (case-insensitive) com outro valor cadastrado, usa a grafia que já está
  // lá (funde os dois) — mesma regra do canonizarValor, pra essa renomeação não criar duplicata.
  const paraFinal = await canonizarValor(campo, para);
  await pool.query(`update produtos set ${campo} = $1 where lower(${campo}) = lower($2)`, [paraFinal, de]);
  if (paraFinal.toLowerCase() !== de.toLowerCase()) {
    await pool.query(`delete from ${tabela} where lower(nome) = lower($1)`, [de]);
  }
  res.json({ ok: true, nome: paraFinal });
}));

router.delete("/campo/:campo/:valor", requireAuth(["compras", "gerente"]), ah(async (req, res) => {
  const { campo, valor } = req.params;
  if (!CAMPOS_GERENCIAVEIS.has(campo)) return res.status(400).json({ erro: "Campo inválido." });
  const tabela = TABELA_DO_CAMPO[campo];
  await pool.query(`update produtos set ${campo} = '' where lower(${campo}) = lower($1)`, [valor]);
  await pool.query(`delete from ${tabela} where lower(nome) = lower($1)`, [valor]);
  res.status(204).end();
}));

// Permissão estreita pro gerente comercial: seção curada (badges) é curadoria de catálogo, não
// dado de compra — mas o resto do produto (nome, preço etc.) continua fora do alcance dele por
// essa rota, que só grava badges. Custo vai na resposta porque o gerente já tem acesso a ele
// via POST/PUT normal (ver calcularCusto acima) — omitir aqui só causaria inconsistência.
router.patch("/:id/curadoria", requireAuth(["gerente"]), ah(async (req, res) => {
  const b = req.body || {};
  const { rows } = await pool.query(
    `update produtos set badges=$1 where id=$2 returning *`,
    [JSON.stringify(b.badges || []), req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ erro: "Produto não encontrado." });
  res.json(toRow(rows[0], true));
}));

module.exports = router;
