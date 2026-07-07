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
    loginConsultor: (consultorId, senha) =>
      request("/auth/login", { method: "POST", body: { role: "consultor", consultorId, senha } }),
  },

  produtos: {
    listar: () => request("/produtos"),
    criar: (p) => request("/produtos", { method: "POST", body: p }),
    atualizar: (id, p) => request(`/produtos/${id}`, { method: "PUT", body: p }),
    remover: (id) => request(`/produtos/${id}`, { method: "DELETE" }),
  },

  consultores: {
    listar: () => request("/consultores"),
    criar: (c) => request("/consultores", { method: "POST", body: c }),
    atualizar: (id, c) => request(`/consultores/${id}`, { method: "PUT", body: c }),
    remover: (id) => request(`/consultores/${id}`, { method: "DELETE" }),
  },

  catalogos: {
    listar: () => request("/catalogos"),
    criar: (c) => request("/catalogos", { method: "POST", body: c }),
    atualizar: (id, c) => request(`/catalogos/${id}`, { method: "PUT", body: c }),
  },

  secoes: {
    listar: () => request("/secoes"),
    atualizar: (id, s) => request(`/secoes/${id}`, { method: "PUT", body: s }),
  },

  envios: {
    listar: () => request("/envios"),
    buscar: (id) => request(`/envios/${id}`).catch(() => null),
    criar: (dados) => request("/envios", { method: "POST", body: dados }),
    marcarEvento: (id, campo, pedidoDetalhe) =>
      request(`/envios/${id}/evento`, { method: "PATCH", body: { campo, pedidoDetalhe } }),
  },
};
