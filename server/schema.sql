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
  preco_de    numeric,
  badges      jsonb not null default '[]',
  nota_promo  text,
  precos      jsonb not null default '{}'  -- { primeira: { vista, parcelado }, farm: { vista, parcelado } }
);

create table if not exists consultores (
  id          text primary key,
  nome        text not null,
  email       text not null unique,
  whatsapp    text,
  setor       text not null check (setor in ('farm', 'primeira')),
  senha_hash  text not null,
  criado_em   timestamptz not null default now()
);

create table if not exists catalogos (
  id            text primary key,
  nome          text not null,
  setor         text not null check (setor in ('farm', 'primeira')),
  itens         jsonb not null default '[]', -- [{ produtoId, precoVista, precoParcelado }]
  status        text not null default 'rascunho' check (status in ('rascunho', 'publicado', 'inativo')),
  criado_em     timestamptz not null default now(),
  capa          text,
  subtitulo     text,
  cor_destaque  text
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
