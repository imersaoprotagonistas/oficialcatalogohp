# HP Catálogo

Painel de catálogos da HP Distribuidora: gerente cadastra produtos e monta catálogos,
consultores enviam links individuais pra cada cliente, e o sistema rastreia o funil
(visualizou → adicionou ao carrinho → pediu) por cliente.

## Arquitetura

- **Frontend**: React + Vite (`src/`).
- **Backend**: Node + Express (`server/`), API REST em `/api/*`.
- **Banco**: Postgres no [Supabase](https://supabase.com).
- Em produção, o backend também serve os arquivos estáticos do frontend (`dist/`) —
  então dá pra rodar tudo como um processo Node só na hospedagem.

## Rodando localmente

### 1. Banco de dados (Supabase)

1. Crie um projeto em [supabase.com](https://supabase.com).
2. Abra **SQL Editor** → **New query**, cole o conteúdo de `server/schema.sql` e rode.
   Isso cria as tabelas `produtos`, `consultores`, `catalogos` e `envios`.
3. Em **Project Settings → Database → Connection string**, copie a URI (você vai usar
   como `DATABASE_URL`).

### 2. Backend

```bash
npm run server:install        # instala as dependências do backend (uma vez)
cp server/.env.example server/.env
```

Edite `server/.env`:
- `DATABASE_URL`: a connection string do Supabase.
- `JWT_SECRET`: uma string aleatória longa. Gere com:
  `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`
- `GERENTE_SENHA_HASH`: o hash da senha do gerente. Depois de preencher `DATABASE_URL`
  e `JWT_SECRET`, gere com:
  `cd server && npm run hash-senha -- "sua-senha-aqui"`
  e cole o resultado em `GERENTE_SENHA_HASH`.

Popule produtos e consultores iniciais (senha padrão dos consultores: `1234`):

```bash
npm run server:seed
```

Suba o backend (porta 3001):

```bash
npm run server
```

### 3. Frontend

Em outro terminal:

```bash
npm install
npm run dev
```

Abra o endereço do terminal (ex: http://localhost:5173). O Vite já está configurado
(`vite.config.js`) pra encaminhar `/api/*` pro backend em `localhost:3001`, então não
precisa mexer em nada — só os dois processos (`npm run server` e `npm run dev`)
rodando ao mesmo tempo.

### Login

- **Gerente**: senha configurada em `GERENTE_SENHA_HASH`.
- **Consultor**: escolha um nome na lista, senha padrão `1234` (defina outra ao editar
  o consultor no painel do gerente).

## Deploy

1. **GitHub**: suba o repositório (`git remote add origin ...` e `git push`).
2. **Supabase**: já é o banco de produção — nada muda, é o mesmo projeto usado no
   desenvolvimento (ou crie um projeto separado só pra produção, se preferir).
3. **Turbocloud**:
   - Clone o repositório no servidor (ou configure o deploy automático a partir do GitHub).
   - Rode `npm install` na raiz e `npm run build` (gera `dist/`).
   - Rode `npm install` dentro de `server/`.
   - Configure as variáveis de ambiente do backend (`DATABASE_URL`, `JWT_SECRET`,
     `GERENTE_SENHA_HASH`, `PORT`) no painel da Turbocloud (ou em `server/.env`, se o
     plano não tiver um painel de env vars).
   - Aponte a aplicação Node para `server/index.js` (é o único processo: ele serve a
     API em `/api/*` e o site em `/`).
   - Se o plano for cPanel com "Setup Node.js App", o "Application root" deve ser a
     pasta `server/` e o "Application startup file" `index.js`.
   - Se for VPS, rode `node server/index.js` (idealmente com PM2: `pm2 start server/index.js --name hp-catalogo`).

## Importante

- O backend valida quem pode ver/editar cada coisa: leitura de produtos/catálogos
  publicados é pública (necessário pro link do cliente funcionar sem login); criar,
  editar e apagar exige login de gerente; o rastreamento (`envios`) só aparece pra
  quem está logado.
- Senhas de consultor e do gerente são guardadas com hash (bcrypt) — nunca em texto puro.
