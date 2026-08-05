// Cliente HTTP para o backend (substitui o antigo storageShim.js baseado em localStorage).
// O token de login fica só em memória: como antes, recarregar a página volta pra tela de login.

let token = null;

async function request(path, { method = "GET", body } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(`${import.meta.env.BASE_URL}api${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error("Servidor da API não respondeu. Ele está rodando? (npm run server)");
  }

  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.erro || `Erro ${res.status} em ${path}`);
  return data;
}

export const api = {
  setToken(t) { token = t; },

  auth: {
    loginGerente: (senha) => request("/auth/login", { method: "POST", body: { role: "gerente", senha } }),
    loginConsultor: (email, senha) =>
      request("/auth/login", { method: "POST", body: { role: "consultor", email, senha } }),
    loginCompras: (email, senha) =>
      request("/auth/login", { method: "POST", body: { role: "compras", email, senha } }),
  },

  produtos: {
    listar: () => request("/produtos"),
    criar: (p) => request("/produtos", { method: "POST", body: p }),
    atualizar: (id, p) => request(`/produtos/${id}`, { method: "PUT", body: p }),
    remover: (id) => request(`/produtos/${id}`, { method: "DELETE" }),
    imagemUrl: (id) => `${import.meta.env.BASE_URL}api/produtos/${id}/imagem`,
    // Só seção (badges) — permissão do gerente comercial, ver server/routes/produtos.js.
    // O resto do produto continua exclusivo de Compras.
    atualizarCuradoria: (id, patch) => request(`/produtos/${id}/curadoria`, { method: "PATCH", body: patch }),
    // Marca/categoria são cadastro de verdade agora (tabelas próprias, ver schema.sql) — dá pra
    // listar (com contagem), criar sem precisar de produto, renomear (também corrige duplicata
    // por maiúscula/minúscula) e excluir.
    listarCampo: (campo) => request(`/produtos/campo/${campo}`),
    criarCampo: (campo, nome) => request(`/produtos/campo/${campo}`, { method: "POST", body: { nome } }),
    renomearCampo: (campo, de, para) => request(`/produtos/campo/${campo}`, { method: "PATCH", body: { de, para } }),
    excluirCampo: (campo, valor) => request(`/produtos/campo/${campo}/${encodeURIComponent(valor)}`, { method: "DELETE" }),
    // Quem criou/editou/excluiu cada produto — só pra quem tem eh_gerente (aba "Histórico").
    listarHistorico: () => request("/produtos/historico"),
  },

  consultores: {
    listar: () => request("/consultores"),
    criar: (c) => request("/consultores", { method: "POST", body: c }),
    atualizar: (id, c) => request(`/consultores/${id}`, { method: "PUT", body: c }),
    remover: (id) => request(`/consultores/${id}`, { method: "DELETE" }),
  },

  compradores: {
    listar: () => request("/compradores"),
    criar: (c) => request("/compradores", { method: "POST", body: c }),
    atualizar: (id, c) => request(`/compradores/${id}`, { method: "PUT", body: c }),
    remover: (id) => request(`/compradores/${id}`, { method: "DELETE" }),
  },

  catalogos: {
    listar: () => request("/catalogos"),
    criar: (c) => request("/catalogos", { method: "POST", body: c }),
    atualizar: (id, c) => request(`/catalogos/${id}`, { method: "PUT", body: c }),
    remover: (id) => request(`/catalogos/${id}`, { method: "DELETE" }),
    capaUrl: (id) => `${import.meta.env.BASE_URL}api/catalogos/${id}/capa`,
  },

  secoes: {
    listar: () => request("/secoes"),
    criar: (s) => request("/secoes", { method: "POST", body: s }),
    atualizar: (id, s) => request(`/secoes/${id}`, { method: "PUT", body: s }),
    remover: (id) => request(`/secoes/${id}`, { method: "DELETE" }),
  },

  buscas: {
    registrar: (dados) => request("/buscas", { method: "POST", body: dados }),
    listar: () => request("/buscas"),
  },

  envios: {
    listar: () => request("/envios"),
    buscar: (id) => request(`/envios/${id}`).catch(() => null),
    criar: (dados) => request("/envios", { method: "POST", body: dados }),
    marcarEvento: (id, campo, pedidoDetalhe) =>
      request(`/envios/${id}/evento`, { method: "PATCH", body: { campo, pedidoDetalhe } }),
  },
};
