-- Rode este arquivo inteiro no SQL editor do Supabase (Project > SQL Editor > New query).
-- Cria as 4 tabelas usadas pelo backend do HP Catálogo.

create table if not exists produtos (
  id          text primary key,
  nome        text not null,
  gramatura   text,
  categoria   text,
  descricao   text,
  emoji       text,
  imagem      text, -- foto do produto em data URL (base64), opcional
  ativo       boolean not null default true,
  marca       text,
  sabor       text, -- legado, não usado mais pelo app (ver "sabores" abaixo)
  sabores     jsonb not null default '[]', -- array de strings, ex: ["Chocolate","Baunilha"]
  custo       numeric, -- custo do produto (usado pra calcular a margem)
  preco_de    numeric, -- legado, não usado mais pelo app (o "De" agora fica dentro de precos, por setor)
  badges      jsonb not null default '[]',
  nota_promo  text,
  precos      jsonb not null default '{}'  -- { primeira: { de, desconto, parcelado, vista }, farm: { de, desconto, parcelado, vista } }
);

-- Marca e categoria são cadastros de verdade, não só "o que já apareceu em algum produto" —
-- dá pra criar uma marca nova antes de qualquer produto usar ela, e a grafia aqui é a oficial
-- (produtos.marca/categoria são sempre reconciliados pra bater com o nome cadastrado aqui,
-- ver canonizarValor em server/routes/produtos.js — é o que impede duplicata por maiúscula/
-- minúscula, tipo "Synthesize" e "SYNTHESIZE" virarem duas marcas diferentes).
create table if not exists marcas (
  nome        text primary key,
  criado_em   timestamptz not null default now()
);
create table if not exists categorias (
  nome        text primary key,
  criado_em   timestamptz not null default now()
);

-- Rastro de quem criou/editou/excluiu cada produto — pro gerente de compras acompanhar a
-- equipe (aba "Histórico" dentro do login de Compras, só quem tem eh_gerente vê). De propósito
-- sem referência (foreign key) pra produtos: precisa sobreviver mesmo depois do produto
-- excluído — é justamente o registro de que ele foi excluído, e por quem.
create table if not exists produtos_historico (
  id            text primary key,
  produto_id    text not null,
  produto_nome  text not null, -- snapshot do nome no momento da ação (produto pode mudar de nome depois)
  acao          text not null check (acao in ('criado', 'editado', 'excluido')),
  autor_tipo    text not null check (autor_tipo in ('compras', 'gerente')),
  autor_id      text, -- id do comprador; null pro gerente comercial (login único, sem conta individual)
  autor_nome    text not null,
  detalhe       text, -- resumo do que mudou numa edição (ex: custo, nome, ativo) — null pra criar/excluir
  criado_em     timestamptz not null default now()
);
create index if not exists produtos_historico_produto_id_idx on produtos_historico(produto_id);
create index if not exists produtos_historico_criado_em_idx on produtos_historico(criado_em desc);

create table if not exists consultores (
  id          text primary key,
  nome        text not null,
  email       text not null unique,
  whatsapp    text,
  setor       text not null check (setor in ('farm', 'primeira')),
  senha_hash  text not null,
  criado_em   timestamptz not null default now()
);

-- Setor de compras da própria HP (quem cadastra produto, custo etc.) — mesmo modelo de
-- login individual do consultor, mas sem whatsapp/setor (não atende cliente final).
-- eh_gerente: só quem tem essa flag vê a aba "Equipe" e pode cadastrar/editar outros
-- compradores (ver server/routes/compradores.js) — o gerente comercial não tem acesso a isso.
create table if not exists compradores (
  id          text primary key,
  nome        text not null,
  email       text not null unique,
  senha_hash  text not null,
  eh_gerente  boolean not null default false,
  criado_em   timestamptz not null default now()
);

create table if not exists catalogos (
  id            text primary key,
  nome          text not null,
  setor         text not null check (setor in ('farm', 'primeira')),
  itens         jsonb not null default '[]', -- [{ produtoId, precoDe, precoVista, precoParcelado }]
  status        text not null default 'rascunho' check (status in ('rascunho', 'publicado', 'inativo')),
  criado_em     timestamptz not null default now(),
  capa          text,
  subtitulo     text,
  cor_destaque  text,
  data_inicio   date, -- validade do catálogo; nulo nos catálogos criados antes dessa coluna existir
  data_fim      date  -- o painel avisa o gerente quando algum catálogo publicado está perto do data_fim
);

create table if not exists envios (
  id               text primary key,
  catalogo_id      text not null references catalogos(id) on delete cascade,
  consultor_id     text not null references consultores(id) on delete cascade,
  cliente_nome     text,
  cliente_telefone text,
  criado_em        timestamptz not null default now(),
  visualizado_em   timestamptz,
  carrinho_em      timestamptz,
  pedido_em        timestamptz,
  pedido_detalhe   jsonb -- { itens: [{ produtoId, quantidade, ... }], total }
);

create index if not exists envios_catalogo_id_idx on envios(catalogo_id);
create index if not exists envios_consultor_id_idx on envios(consultor_id);

-- Seções curadas do catálogo público (ex: "Marcas Exclusivas", "Lançamentos"), uma por
-- combinação setor+chave de badge. título/descrição/ativo/ordem são editáveis pelo gerente;
-- a cor/gradiente de cada seção continua fixa no front (ligada à chave), por decisão de produto.
create table if not exists secoes_curadas (
  id         text primary key, -- `${setor}_${chave}`
  setor      text not null check (setor in ('farm', 'primeira')),
  chave      text not null,    -- bate com a chave do badge do produto (marca_exclusiva, lancamento, oferta, mais_vendido)
  titulo     text not null,
  descricao  text,
  ativo      boolean not null default true,
  ordem      integer not null default 0,
  cor        text not null default '#78716c', -- hex, dá o tom do banner da seção no catálogo público
  unique (setor, chave)
);

-- Termos que o cliente buscou no catálogo público e não encontraram nenhum produto.
-- Vira sinal de demanda pro gerente na tela de Rastreamento (Painel > Rastreamento).
create table if not exists buscas_sem_resultado (
  id           text primary key,
  catalogo_id  text not null references catalogos(id) on delete cascade,
  consultor_id text not null references consultores(id) on delete cascade,
  termo        text not null,
  criado_em    timestamptz not null default now()
);
create index if not exists buscas_sem_resultado_catalogo_id_idx on buscas_sem_resultado(catalogo_id);

-- Se você já tinha rodado este arquivo antes (tabela produtos já existe sem as colunas
-- abaixo), rode só as linhas que faltarem:
-- alter table produtos add column if not exists sabor text;
-- alter table produtos add column if not exists custo numeric;
-- alter table produtos add column if not exists sabores jsonb not null default '[]';
-- alter table catalogos add column if not exists data_inicio date;
-- alter table catalogos add column if not exists data_fim date;

-- O backend só acessa o banco pela role dona das tabelas (bypassa RLS por padrão), então
-- ligar RLS aqui não muda nada pro app — só impede que a API pública do Supabase
-- (PostgREST, alcançável com a chave anon) leia/escreva essas tabelas sem passar pelo Express.
alter table secoes_curadas enable row level security;
alter table buscas_sem_resultado enable row level security;
