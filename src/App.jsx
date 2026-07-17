import { useState, useEffect, useRef, useMemo } from "react";
import {
  Package, Users, LayoutGrid, Activity, Plus, Trash2, Pencil, Copy,
  ShoppingCart, Send, Eye, LogOut, X, Check, Minus, MessageCircle,
  UserPlus, Filter, TrendingUp, ChevronRight, Search, RefreshCw,
  ChevronUp, ChevronDown
} from "lucide-react";
import { api } from "./api.js";

const SETORES = { primeira: "1º Compra", farm: "Farm" };
const CATEGORIA_SUGESTOES = ["Proteínas", "Creatina", "Aminoácidos", "Vitaminas", "Pré-treino", "Snacks", "Acessórios", "Outros"];
const CATEGORIA_DOT = {
  "Proteínas": "bg-red-500", "Creatina": "bg-emerald-500", "Aminoácidos": "bg-lime-500",
  "Vitaminas": "bg-sky-500", "Pré-treino": "bg-violet-500", "Snacks": "bg-cyan-500",
  "Acessórios": "bg-stone-400", "Outros": "bg-stone-500",
};
const DIA_MS = 86400000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const formatBRL = (n) => (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const pct = (num, den) => (den > 0 ? Math.round((num / den) * 100) : 0);
// "AAAA-MM-DD" de hoje no fuso local (não UTC) — é o formato que <input type="date"> espera.
function hojeISO() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
// Quantos dias faltam pro data_fim (negativo = já expirou). null se o catálogo não tem validade definida.
function diasParaExpirar(dataFim) {
  if (!dataFim) return null;
  const hoje = new Date(hojeISO() + "T00:00:00");
  const fim = new Date(dataFim + "T00:00:00");
  return Math.round((fim - hoje) / DIA_MS);
}
const DIAS_AVISO_EXPIRACAO = 3;
function formatDataBR(iso) {
  if (!iso) return "";
  const [, mes, dia] = iso.split("-");
  return `${dia}/${mes}`;
}
const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const formatPct = (n) => `${(Number(n) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
// Fluxo de precificação: De -> % desconto -> Valor do desconto -> Por -> 3% OFF -> À vista.
// Desconto sempre incide sobre "De"; o 3% OFF sempre incide sobre "Por" (nunca sobre o "De").
// Margem é calculada sobre o À vista (não sobre o Por), porque à vista é o piso — o preço
// mais baixo que o cliente pode pagar, então é o cenário de margem mais conservador/real.
function calcularPrecoSetor({ de, desconto, custo }) {
  const deN = round2(de || 0);
  const descontoN = Number(desconto) || 0;
  const custoN = round2(custo || 0);
  const valorDesconto = round2(deN * (descontoN / 100));
  const por = round2(deN - valorDesconto);
  const valor3off = round2(por * 0.03);
  const vista = round2(por - valor3off);
  const margemReais = round2(vista - custoN);
  const margemPct = vista > 0 ? round2((margemReais / vista) * 100) : 0;
  return { valorDesconto, por, valor3off, vista, margemReais, margemPct };
}
// Formatação condicional da margem: >= 28% verde, entre 27% e 28% amarelo, abaixo de 27% vermelho.
function corMargem(margemPct) {
  if (margemPct >= 28) return { dot: "bg-orange-500", texto: "text-orange-700", fundo: "bg-orange-50", borda: "border-orange-300", label: "Margem saudável" };
  if (margemPct >= 27) return { dot: "bg-amber-500", texto: "text-amber-700", fundo: "bg-amber-50", borda: "border-amber-300", label: "Margem no limite" };
  return { dot: "bg-red-500", texto: "text-red-700", fundo: "bg-red-50", borda: "border-red-300", label: "Margem abaixo do limite" };
}
const toWaNumber = (raw) => {
  const digits = String(raw || "").replace(/\D/g, "");
  return digits.startsWith("55") ? digits : `55${digits}`;
};
// Fonte da imagem pra exibir: se já tem o base64 em mãos (produto recém-editado nesta sessão),
// usa direto, sem round-trip; senão busca na rota dedicada (leve, cacheável pelo navegador).
// Ver server/routes/produtos.js e server/routes/catalogos.js.
const produtoImgSrc = (p) => (p?.imagem ? p.imagem : p?.temImagem ? api.produtos.imagemUrl(p.id) : null);
const catalogoCapaSrc = (c) => (c?.capa ? c.capa : c?.temCapa ? api.catalogos.capaUrl(c.id) : null);
// Baixa uma imagem já salva (das rotas acima) de volta como data URL, pra pré-carregar o
// formulário de edição sem precisar reenviar o produto/catálogo inteiro só pra manter a foto.
async function urlParaDataUrl(url) {
  // no-store: a rota tem Cache-Control de 24h (bom pra listagem), mas aqui precisamos sempre
  // da foto atual — senão, depois de trocar a imagem, reabrir a edição mostra a antiga cacheada.
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return "";
  const blob = await res.blob();
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });
}
const CATALOGO_COR_PADRAO = "#f97316";
const SEM_SABOR = "_"; // chave usada no carrinho pra produtos sem variação de sabor
const hexToRgba = (hex, alpha) => {
  const clean = String(hex || CATALOGO_COR_PADRAO).replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  const n = parseInt(full, 16) || 0xf97316;
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
};
function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
// Fotos de produto/capa vêm direto do celular (facilmente 3-4mb cada), o que pesava tanto no
// banco quanto na resposta da API. Redimensiona no navegador antes de enviar — se algo falhar
// no meio do caminho, cai pra imagem original sem cortar, nunca perde a foto por causa disso.
async function fileParaDataUrlOtimizado(file, maxDim = 1000, qualidade = 0.85) {
  const original = await fileToDataUrl(file);
  if (!file.type?.startsWith("image/") || file.type === "image/svg+xml") return original;
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const escala = Math.min(1, maxDim / Math.max(img.width, img.height));
      if (escala >= 1) { resolve(original); return; }
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * escala);
      canvas.height = Math.round(img.height * escala);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      const formato = file.type === "image/png" ? "image/png" : "image/jpeg";
      resolve(canvas.toDataURL(formato, qualidade));
    };
    img.onerror = () => resolve(original);
    img.src = original;
  });
}

const PERIODO_PRESETS = [
  { id: "todos", label: "Todo o período" },
  { id: "hoje", label: "Hoje" },
  { id: "semana", label: "Esta semana" },
  { id: "7dias", label: "Últimos 7 dias" },
  { id: "mes", label: "Este mês" },
  { id: "30dias", label: "Últimos 30 dias" },
  { id: "ano", label: "Este ano" },
  { id: "personalizado", label: "Personalizado…" },
];
// Calcula os limites [de, até) em ms do período escolhido, pra filtrar envios por criadoEm.
// "de"/"ate" nulos significam sem limite (equivalente a "todo o período").
function calcularIntervaloPeriodo(periodo, dataInicio, dataFim) {
  const agora = new Date();
  const inicioHoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate()).getTime();
  const fimHoje = inicioHoje + DIA_MS;
  switch (periodo) {
    case "hoje": return { de: inicioHoje, ate: fimHoje };
    case "semana": {
      const offsetSegunda = (agora.getDay() + 6) % 7; // dias desde a última segunda-feira
      return { de: inicioHoje - offsetSegunda * DIA_MS, ate: fimHoje };
    }
    case "7dias": return { de: inicioHoje - 6 * DIA_MS, ate: fimHoje };
    case "mes": return { de: new Date(agora.getFullYear(), agora.getMonth(), 1).getTime(), ate: fimHoje };
    case "30dias": return { de: inicioHoje - 29 * DIA_MS, ate: fimHoje };
    case "ano": return { de: new Date(agora.getFullYear(), 0, 1).getTime(), ate: fimHoje };
    case "personalizado": return {
      de: dataInicio ? new Date(`${dataInicio}T00:00:00`).getTime() : null,
      ate: dataFim ? new Date(`${dataFim}T00:00:00`).getTime() + DIA_MS : null,
    };
    default: return { de: null, ate: null };
  }
}

function parseRotaPublica() {
  const m = window.location.hash.match(/^#\/c\/([^/]+)\/([^/]+)(?:\/([^/]+))?$/);
  if (!m) return null;
  return { catalogoId: m[1], consultorId: m[2], envioId: m[3] || null };
}
function linkBase() {
  return `${window.location.origin}${window.location.pathname}`.replace(/\/$/, "");
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------
export default function App() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [produtos, setProdutosState] = useState([]);
  const [consultores, setConsultoresState] = useState([]);
  const [catalogos, setCatalogosState] = useState([]);
  const [secoes, setSecoes] = useState([]);
  const [envios, setEnvios] = useState([]);
  const [buscas, setBuscas] = useState([]); // buscas sem resultado no catálogo público — só o gerente enxerga

  const [view, setView] = useState("login");
  const [currentUser, setCurrentUser] = useState(null);
  const [preview, setPreview] = useState(null); // { catalogoId, consultorId, envioId, envio, returnTo }
  const [sincronizando, setSincronizando] = useState(false);
  const [erroCarregamento, setErroCarregamento] = useState(null);

  // Produtos/consultores/catálogos são públicos pra leitura (o backend filtra o que
  // cada papel pode ver); envios exige login, porque contém dados de clientes.
  async function carregarDadosPublicos() {
    const [p, c, cat, sec] = await Promise.all([api.produtos.listar(), api.consultores.listar(), api.catalogos.listar(), api.secoes.listar()]);
    setProdutosState(p); setConsultoresState(c); setCatalogosState(cat); setSecoes(sec);
    return { produtos: p, consultores: c, catalogos: cat, secoes: sec };
  }
  // "role" vem explícito (em vez de ler currentUser do state) porque isso é chamado logo
  // depois de um setCurrentUser no login, antes do re-render que atualizaria o state.
  async function carregarEnvios(role) {
    const chamadas = [api.envios.listar()];
    if (role === "gerente") chamadas.push(api.buscas.listar());
    const [env, busc] = await Promise.all(chamadas);
    setEnvios(env);
    if (busc) setBuscas(busc);
    return env;
  }

  async function sincronizar() {
    setSincronizando(true);
    await carregarDadosPublicos();
    if (currentUser) await carregarEnvios(currentUser.role);
    setSincronizando(false);
  }

  async function carregarInicial() {
    setLoading(true);
    setErroCarregamento(null);
    try {
      const { catalogos: cat } = await carregarDadosPublicos();

      const rota = parseRotaPublica();
      if (rota) {
        const catalogoAlvo = cat.find((c) => c.id === rota.catalogoId);
        const ativo = catalogoAlvo?.status === "publicado";
        let envioId = rota.envioId;
        let envio = envioId ? await api.envios.buscar(envioId) : null;
        if (ativo && !envio) {
          envio = await api.envios.criar({ catalogoId: rota.catalogoId, consultorId: rota.consultorId });
          envioId = envio.id;
          window.history.replaceState(null, "", `${linkBase()}#/c/${rota.catalogoId}/${rota.consultorId}/${envioId}`);
        }
        setPreview({ catalogoId: rota.catalogoId, consultorId: rota.consultorId, envioId, envio, simulate: false, returnTo: null });
        setView("publico");
      }
    } catch (e) {
      setErroCarregamento(e.message || "Não foi possível conectar ao servidor.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { carregarInicial(); }, []);

  // Sincroniza uma coleção inteira (o jeito como os painéis de gerente já editam
  // localmente) com o backend, fazendo só as chamadas por registro necessárias.
  async function persistirColecao(recurso, atual, novo, setter) {
    setter(novo);
    setSaving(true);
    try {
      const idsNovos = new Set(novo.map((x) => x.id));
      const removidos = atual.filter((x) => !idsNovos.has(x.id));
      const criados = novo.filter((x) => !atual.some((a) => a.id === x.id));
      const atualizados = novo.filter((x) => {
        const anterior = atual.find((a) => a.id === x.id);
        return anterior && JSON.stringify(anterior) !== JSON.stringify(x);
      });
      await Promise.all([
        ...removidos.map((x) => recurso.remover(x.id)),
        ...criados.map((x) => recurso.criar(x)),
        ...atualizados.map((x) => recurso.atualizar(x.id, x)),
      ]);
    } catch (e) {
      // A tela já tinha atualizado otimista (setter(novo) acima) antes de saber se o
      // servidor aceitou — sem isso, um PUT/POST que falha (rede, sessão, payload) deixava
      // a tela mostrando algo "salvo" que nunca chegou ao banco, sem nenhum aviso.
      setter(atual);
      alert(`Não foi possível salvar: ${e.message || "erro desconhecido"}. Tente novamente.`);
    } finally {
      setSaving(false);
    }
  }
  function setProdutos(v) { persistirColecao(api.produtos, produtos, v, setProdutosState); }
  function setConsultores(v) { persistirColecao(api.consultores, consultores, v, setConsultoresState); }
  function setCatalogos(v) { persistirColecao(api.catalogos, catalogos, v, setCatalogosState); }

  async function atualizarSecao(id, patch) {
    setSaving(true);
    try {
      const atualizado = await api.secoes.atualizar(id, patch);
      setSecoes((atual) => atual.map((s) => (s.id === id ? atualizado : s)));
    } finally {
      setSaving(false);
    }
  }

  // Cada seção mora na sua própria linha (setor x chave) — criar uma nova nunca sobrescreve
  // as que já estão vigentes na vitrine.
  async function criarSecao(dados) {
    setSaving(true);
    try {
      const nova = await api.secoes.criar(dados);
      setSecoes((atual) => [...atual, nova]);
      return nova;
    } finally {
      setSaving(false);
    }
  }

  async function criarEnvio(catalogoId, consultorId, clienteNome, clienteTelefone) {
    const novo = await api.envios.criar({ catalogoId, consultorId, clienteNome, clienteTelefone });
    setEnvios((atual) => [novo, ...atual]);
    return novo;
  }

  async function marcarEvento(envioId, campo, pedidoDetalhe) {
    const atualizado = await api.envios.marcarEvento(envioId, campo, pedidoDetalhe);
    setEnvios((atual) => atual.map((e) => (e.id === envioId ? atualizado : e)));
    setPreview((p) => (p && p.envioId === envioId ? { ...p, envio: atualizado } : p));
  }

  async function loginGerente(senha) {
    const { token } = await api.auth.loginGerente(senha);
    api.setToken(token);
    setCurrentUser({ role: "gerente" });
    await Promise.all([carregarDadosPublicos(), carregarEnvios("gerente")]);
    setView("gerente");
  }
  async function loginConsultor(consultorId, senha) {
    const { token, user } = await api.auth.loginConsultor(consultorId, senha);
    api.setToken(token);
    setCurrentUser({ role: "consultor", ...user });
    await Promise.all([carregarDadosPublicos(), carregarEnvios("consultor")]);
    setView("consultor");
  }

  // Fogo-e-esquece: não bloqueia a navegação do visitante nem precisa atualizar
  // nenhum state local (o gerente vê o agregado quando abrir/sincronizar o Rastreamento).
  function registrarBuscaSemResultado(catalogoId, consultorId, termo) {
    api.buscas.registrar({ catalogoId, consultorId, termo }).catch(() => {});
  }

  function logout() {
    api.setToken(null);
    setCurrentUser(null); setPreview(null); setEnvios([]); setView("login");
  }

  function abrirSimulacao(catalogoId, consultorId, returnTo) {
    setPreview({ catalogoId, consultorId, envioId: null, envio: null, simulate: true, returnTo });
    setView("publico");
  }
  function abrirEnvioReal(catalogoId, consultorId, envioId, returnTo) {
    const envio = envios.find((e) => e.id === envioId) || null;
    setPreview({ catalogoId, consultorId, envioId, envio, simulate: false, returnTo });
    setView("publico");
  }

  if (loading) {
    return <div className="min-h-[500px] flex items-center justify-center bg-stone-50 font-sans">
      <div className="text-stone-400 text-sm tracking-wide">Carregando sistema…</div>
    </div>;
  }

  if (erroCarregamento) {
    return (
      <div className="min-h-[500px] flex items-center justify-center bg-stone-50 font-sans px-4">
        <div className="max-w-sm text-center">
          <div className="font-black text-lg text-stone-900">Não deu pra carregar o sistema</div>
          <p className="text-stone-500 text-sm mt-2">{erroCarregamento}</p>
          <p className="text-stone-400 text-xs mt-1">Verifique se o backend (servidor da API) está rodando.</p>
          <button onClick={carregarInicial}
            className="mt-4 inline-flex items-center gap-1.5 bg-neutral-950 text-white text-xs font-bold uppercase tracking-wide px-4 py-2.5 rounded-md hover:bg-stone-800">
            <RefreshCw size={13} /> Tentar de novo
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[600px] bg-stone-50 font-sans text-stone-900">
      {view === "login" && (
        <LoginScreen consultores={consultores} onGerenteLogin={loginGerente} onConsultorLogin={loginConsultor} />
      )}

      {view === "gerente" && currentUser?.role === "gerente" && (
        <GerentePanel
          produtos={produtos} setProdutos={setProdutos}
          consultores={consultores} setConsultores={setConsultores}
          catalogos={catalogos} setCatalogos={setCatalogos}
          secoes={secoes} atualizarSecao={atualizarSecao} criarSecao={criarSecao}
          envios={envios} buscas={buscas} saving={saving} onLogout={logout}
          onSimular={(catId, consId) => abrirSimulacao(catId, consId, "gerente")}
          onSincronizar={sincronizar} sincronizando={sincronizando}
        />
      )}

      {view === "consultor" && currentUser?.role === "consultor" && (
        <ConsultorPanel
          consultor={currentUser} catalogos={catalogos} envios={envios}
          onCriarEnvio={criarEnvio} onLogout={logout}
          onSimular={(catId) => abrirSimulacao(catId, currentUser.id, "consultor")}
          onAbrirEnvio={(catId, envioId) => abrirEnvioReal(catId, currentUser.id, envioId, "consultor")}
          onSincronizar={sincronizar} sincronizando={sincronizando}
        />
      )}

      {view === "publico" && preview && (
        <CatalogoPublico
          catalogo={(() => {
            const alvo = catalogos.find((c) => c.id === preview.catalogoId);
            const bloqueado = alvo && !preview.simulate && alvo.status !== "publicado";
            return bloqueado ? undefined : alvo;
          })()}
          consultor={consultores.find((c) => c.id === preview.consultorId)}
          produtos={produtos}
          secoes={secoes}
          simulate={preview.simulate}
          onPrimeiraVisualizacao={() => {
            if (preview.simulate || !preview.envioId) return;
            marcarEvento(preview.envioId, "visualizadoEm");
          }}
          onAdicionouCarrinho={() => {
            if (preview.simulate || !preview.envioId) return;
            if (preview.envio && !preview.envio.carrinhoEm) marcarEvento(preview.envioId, "carrinhoEm");
          }}
          onPedido={(detalhe) => {
            if (preview.simulate || !preview.envioId) return;
            marcarEvento(preview.envioId, "pedidoEm", detalhe);
          }}
          onBuscaSemResultado={(termo) => {
            if (preview.simulate) return;
            registrarBuscaSemResultado(preview.catalogoId, preview.consultorId, termo);
          }}
          onSair={preview.returnTo ? () => { setView(preview.returnTo === "consultor" ? "consultor" : "gerente"); setPreview(null); } : undefined}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared chrome — top nav + black hero band
// ---------------------------------------------------------------------------
function TopNav({ tabs, current, onNav, roleLabel, onLogout }) {
  return (
    <header className="bg-neutral-950 text-stone-300">
      <div className="max-w-6xl mx-auto px-6 flex items-center justify-between h-14">
        <div className="font-black tracking-tight text-white text-lg">
          HP <span className="text-orange-400">DISTRIBUIDORA</span>
        </div>
        <nav className="hidden sm:flex items-center gap-6">
          {tabs.map((t) => (
            <button key={t.id} onClick={() => onNav(t.id)}
              className={`text-xs font-bold uppercase tracking-wide pb-1 border-b-2 transition ${
                current === t.id ? "text-white border-orange-400" : "text-stone-400 border-transparent hover:text-stone-200"}`}>
              {t.label}
            </button>
          ))}
        </nav>
        <div className="flex items-center gap-3">
          <span className="hidden sm:inline text-[11px] text-stone-500 uppercase tracking-wide">{roleLabel}</span>
          <button onClick={onLogout}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-stone-300 border border-stone-700 rounded-md px-3 py-1.5 hover:bg-stone-800">
            <LogOut size={13} /> Sair
          </button>
        </div>
      </div>
    </header>
  );
}

function Hero({ title, stats }) {
  return (
    <div className="bg-neutral-950 px-6 pb-8 pt-6">
      <div className="max-w-6xl mx-auto flex flex-wrap items-end justify-between gap-6">
        <h1 className="text-white font-black uppercase tracking-tighter text-5xl leading-none">{title}</h1>
        {stats && (
          <div className="flex gap-8">
            {stats.map((s) => (
              <div key={s.label} className="text-right">
                <div className={`font-black text-3xl leading-none ${s.color || "text-white"}`}>{s.value}</div>
                <div className="text-[10px] text-stone-500 uppercase tracking-wide mt-1">{s.label}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------
function LoginScreen({ consultores, onGerenteLogin, onConsultorLogin }) {
  const [tab, setTab] = useState("gerente");
  const [senha, setSenha] = useState("");
  const [consultorId, setConsultorId] = useState(consultores[0]?.id || "");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function submitGerente(e) {
    e.preventDefault();
    setErro(""); setEnviando(true);
    try { await onGerenteLogin(senha); }
    catch { setErro("Senha incorreta."); }
    finally { setEnviando(false); }
  }
  async function submitConsultor(e) {
    e.preventDefault();
    setErro(""); setEnviando(true);
    try { await onConsultorLogin(consultorId, senha); }
    catch { setErro("Consultor ou senha incorretos."); }
    finally { setEnviando(false); }
  }

  return (
    <div className="min-h-[600px] bg-neutral-950 flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm">
        <div className="mb-10 text-center">
          <div className="font-black text-3xl tracking-tighter text-white">HP <span className="text-orange-400">DISTRIBUIDORA</span></div>
          <p className="text-stone-500 text-xs mt-2 uppercase tracking-wide">Painel de catálogos</p>
        </div>

        <div className="flex rounded-lg bg-stone-900 p-1 mb-6">
          <button onClick={() => { setTab("gerente"); setErro(""); }}
            className={`flex-1 py-2 text-xs font-bold uppercase tracking-wide rounded-md transition ${tab === "gerente" ? "bg-orange-400 text-neutral-950" : "text-stone-400"}`}>
            Gerente
          </button>
          <button onClick={() => { setTab("consultor"); setErro(""); }}
            className={`flex-1 py-2 text-xs font-bold uppercase tracking-wide rounded-md transition ${tab === "consultor" ? "bg-orange-400 text-neutral-950" : "text-stone-400"}`}>
            Consultor
          </button>
        </div>

        {tab === "gerente" ? (
          <form onSubmit={submitGerente} className="space-y-3">
            <input type="password" placeholder="Senha do gerente" value={senha} onChange={(e) => setSenha(e.target.value)}
              className="w-full bg-stone-900 border border-stone-700 text-white placeholder-stone-500 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
            {erro && <p className="text-red-400 text-xs">{erro}</p>}
            <button type="submit" disabled={enviando} className="w-full bg-orange-400 text-neutral-950 rounded-lg py-2.5 text-sm font-bold hover:bg-orange-300 transition disabled:opacity-60">
              {enviando ? "Entrando…" : "Entrar"}
            </button>
          </form>
        ) : (
          <form onSubmit={submitConsultor} className="space-y-3">
            <select value={consultorId} onChange={(e) => setConsultorId(e.target.value)}
              className="w-full bg-stone-900 border border-stone-700 text-white rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400">
              {consultores.map((c) => <option key={c.id} value={c.id}>{c.nome} — {SETORES[c.setor]}</option>)}
            </select>
            <input type="password" placeholder="Sua senha" value={senha} onChange={(e) => setSenha(e.target.value)}
              className="w-full bg-stone-900 border border-stone-700 text-white placeholder-stone-500 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
            {erro && <p className="text-red-400 text-xs">{erro}</p>}
            <button type="submit" disabled={enviando} className="w-full bg-orange-400 text-neutral-950 rounded-lg py-2.5 text-sm font-bold hover:bg-orange-300 transition disabled:opacity-60">
              {enviando ? "Entrando…" : "Entrar"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Gerente — PAINEL / CONSULTORES / RASTREAMENTO
// ---------------------------------------------------------------------------
function GerentePanel({ produtos, setProdutos, consultores, setConsultores, catalogos, setCatalogos, secoes, atualizarSecao, criarSecao, envios, buscas, saving, onLogout, onSimular, onSincronizar, sincronizando }) {
  const [tab, setTab] = useState("painel");
  const tabs = [
    { id: "painel", label: "Painel" },
    { id: "consultores", label: "Consultores" },
    { id: "secoes", label: "Seções" },
    { id: "rastreamento", label: "Rastreamento" },
  ];

  const produtosAtivos = produtos.filter((p) => p.ativo !== false).length;
  // Aviso de validade: catálogos publicados que já expiraram ou estão perto de expirar.
  const catalogosExpirando = catalogos
    .filter((c) => c.status === "publicado" && c.dataFim)
    .map((c) => ({ catalogo: c, dias: diasParaExpirar(c.dataFim) }))
    .filter(({ dias }) => dias <= DIAS_AVISO_EXPIRACAO)
    .sort((a, b) => a.dias - b.dias);

  return (
    <div>
      <TopNav tabs={tabs} current={tab} onNav={setTab} roleLabel="Gestor comercial" onLogout={onLogout} />

      {tab === "painel" && (
        <>
          <Hero title="Painel" stats={[
            { label: "Produtos ativos", value: produtosAtivos },
            { label: "Catálogos", value: catalogos.length },
            { label: "Consultores", value: consultores.length },
          ]} />
          <div className="max-w-6xl mx-auto px-6 py-8 space-y-10">
            {saving && <div className="text-[11px] text-stone-400 -mt-4">Salvando…</div>}
            {catalogosExpirando.length > 0 && (
              <div className="bg-amber-50 border border-amber-300 rounded-xl p-4">
                <div className="text-xs font-bold uppercase tracking-wide text-amber-700 mb-2">
                  ⚠ {catalogosExpirando.length} catálogo{catalogosExpirando.length === 1 ? "" : "s"} publicado{catalogosExpirando.length === 1 ? "" : "s"} perto do fim da validade
                </div>
                <div className="space-y-1">
                  {catalogosExpirando.map(({ catalogo: c, dias }) => (
                    <div key={c.id} className="text-sm text-amber-800">
                      <span className="font-semibold">{c.nome}</span> ({SETORES[c.setor]}) —{" "}
                      {dias < 0 ? `expirou há ${Math.abs(dias)} dia${Math.abs(dias) === 1 ? "" : "s"}`
                        : dias === 0 ? "expira hoje" : dias === 1 ? "expira amanhã" : `expira em ${dias} dias`}
                      {" "}(até {formatDataBR(c.dataFim)})
                    </div>
                  ))}
                </div>
              </div>
            )}
            <CatalogosSection produtos={produtos} consultores={consultores} catalogos={catalogos}
              setCatalogos={setCatalogos} onSimular={onSimular} />
            <ProdutosSection produtos={produtos} setProdutos={setProdutos} envios={envios} secoes={secoes} />
          </div>
        </>
      )}

      {tab === "consultores" && (
        <>
          <Hero title="Consultores" stats={[{ label: "Cadastrados", value: consultores.length }]} />
          <div className="max-w-6xl mx-auto px-6 py-8">
            <ConsultoresSection consultores={consultores} setConsultores={setConsultores} catalogos={catalogos} envios={envios} />
          </div>
        </>
      )}

      {tab === "secoes" && (
        <>
          <Hero title="Seções" stats={[
            { label: "Ativas", value: secoes.filter((s) => s.ativo).length },
            { label: "Total", value: secoes.length },
          ]} />
          <div className="max-w-6xl mx-auto px-6 py-8">
            <SecoesSection secoes={secoes} atualizarSecao={atualizarSecao} criarSecao={criarSecao} />
          </div>
        </>
      )}

      {tab === "rastreamento" && (
        <RastreamentoView consultores={consultores} catalogos={catalogos} envios={envios} buscas={buscas} escopo="todos"
          onSincronizar={onSincronizar} sincronizando={sincronizando} />
      )}
    </div>
  );
}

// --- Busca + filtro de produtos (Marca / Produto / Categoria / Sabor) ---
// Compartilhado entre o seletor de produtos do catálogo e a tabela de Produtos —
// com 400+ produtos, filtrar em memória (sem ida ao servidor) já é instantâneo.
function useFiltroProdutos(produtos) {
  const [busca, setBusca] = useState("");
  const [marca, setMarca] = useState("todas");
  const [categoria, setCategoria] = useState("todas");
  const [sabor, setSabor] = useState("todas");

  const valoresUnicos = (campo) => [...new Set(produtos.map((p) => p[campo]).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const marcas = useMemo(() => valoresUnicos("marca"), [produtos]);
  const categorias = useMemo(() => valoresUnicos("categoria"), [produtos]);
  const sabores = useMemo(() => [...new Set(produtos.flatMap((p) => p.sabores || []))].sort((a, b) => a.localeCompare(b)), [produtos]);

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return produtos.filter((p) => {
      if (termo && !p.nome.toLowerCase().includes(termo)) return false;
      if (marca !== "todas" && p.marca !== marca) return false;
      if (categoria !== "todas" && p.categoria !== categoria) return false;
      if (sabor !== "todas" && !(p.sabores || []).includes(sabor)) return false;
      return true;
    });
  }, [produtos, busca, marca, categoria, sabor]);

  const temFiltroAtivo = Boolean(busca.trim()) || marca !== "todas" || categoria !== "todas" || sabor !== "todas";
  function limpar() { setBusca(""); setMarca("todas"); setCategoria("todas"); setSabor("todas"); }

  return { busca, setBusca, marca, setMarca, categoria, setCategoria, sabor, setSabor,
    marcas, categorias, sabores, filtrados, temFiltroAtivo, limpar };
}

function FiltroProdutosBar({ f, placeholder }) {
  return (
    <div className="flex flex-wrap gap-2 items-center bg-stone-50 border border-stone-200 rounded-lg p-2.5 mb-3">
      <div className="relative flex-1 min-w-[180px]">
        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400 pointer-events-none" />
        <input value={f.busca} onChange={(e) => f.setBusca(e.target.value)} placeholder={placeholder || "Buscar por nome do produto…"}
          className="w-full border border-stone-300 rounded-lg pl-8 pr-3 py-1.5 text-sm bg-white" />
      </div>
      <select value={f.marca} onChange={(e) => f.setMarca(e.target.value)} className="border border-stone-300 rounded-lg px-2 py-1.5 text-xs bg-white">
        <option value="todas">Todas as marcas</option>
        {f.marcas.map((m) => <option key={m} value={m}>{m}</option>)}
      </select>
      <select value={f.categoria} onChange={(e) => f.setCategoria(e.target.value)} className="border border-stone-300 rounded-lg px-2 py-1.5 text-xs bg-white">
        <option value="todas">Todas as categorias</option>
        {f.categorias.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
      <select value={f.sabor} onChange={(e) => f.setSabor(e.target.value)} className="border border-stone-300 rounded-lg px-2 py-1.5 text-xs bg-white">
        <option value="todas">Todos os sabores</option>
        {f.sabores.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
      {f.temFiltroAtivo && (
        <button onClick={f.limpar} className="text-xs font-bold uppercase tracking-wide text-stone-500 hover:text-stone-900">Limpar</button>
      )}
    </div>
  );
}

// --- Painel > Catálogos ---
function CatalogosSection({ produtos, consultores, catalogos, setCatalogos, onSimular }) {
  const [criando, setCriando] = useState(false);
  const [nome, setNome] = useState("");
  const [setor, setSetor] = useState("farm");
  const [capa, setCapa] = useState("");
  const [subtitulo, setSubtitulo] = useState("");
  const [corDestaque, setCorDestaque] = useState(CATALOGO_COR_PADRAO);
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [selecionados, setSelecionados] = useState({});
  const [expandido, setExpandido] = useState(null);
  const [editandoId, setEditandoId] = useState(null); // null = criando novo; id = editando catálogo existente
  const [copiado, setCopiado] = useState(null);
  const formRef = useRef(null);
  const capaRequestRef = useRef(0); // descarta a busca da capa se o usuário trocar de catálogo antes dela terminar

  useEffect(() => {
    if (criando) formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [criando]);

  function iniciarCriacao() {
    const base = {};
    produtos.forEach((p) => { base[p.id] = { on: false, de: p.precos?.[setor]?.de ?? 0, vista: p.precos?.[setor]?.vista ?? 0, parcelado: p.precos?.[setor]?.parcelado ?? 0 }; });
    setSelecionados(base); setNome(""); setCapa(""); setSubtitulo(""); setCorDestaque(CATALOGO_COR_PADRAO);
    setDataInicio(hojeISO()); setDataFim("");
    setEditandoId(null); setCriando(true);
    capaRequestRef.current += 1; // invalida qualquer busca de capa de uma edição anterior ainda em andamento
  }
  async function iniciarEdicao(cat) {
    const itensPorId = Object.fromEntries(cat.itens.map((it) => [it.produtoId, it]));
    const base = {};
    produtos.forEach((p) => {
      const item = itensPorId[p.id];
      base[p.id] = item
        ? { on: true, de: item.precoDe ?? 0, vista: item.precoVista, parcelado: item.precoParcelado }
        : { on: false, de: p.precos?.[cat.setor]?.de ?? 0, vista: p.precos?.[cat.setor]?.vista ?? 0, parcelado: p.precos?.[cat.setor]?.parcelado ?? 0 };
    });
    setSelecionados(base);
    setNome(cat.nome); setSetor(cat.setor); setSubtitulo(cat.subtitulo || ""); setCorDestaque(cat.corDestaque || CATALOGO_COR_PADRAO);
    setDataInicio(cat.dataInicio || hojeISO()); setDataFim(cat.dataFim || "");
    // Limpa a capa antiga já — sem isso, o formulário abre mostrando a capa que sobrou do
    // catálogo editado por último até a busca abaixo terminar (podia ser de outro catálogo).
    setCapa("");
    setEditandoId(cat.id); setCriando(true);
    const requestId = ++capaRequestRef.current;
    const novaCapa = cat.temCapa ? await urlParaDataUrl(api.catalogos.capaUrl(cat.id)) : "";
    // Se o usuário já trocou de catálogo (ou cancelou e abriu outro) antes da busca terminar,
    // descarta o resultado pra não aplicar a capa errada por cima da seleção atual.
    if (capaRequestRef.current === requestId) setCapa(novaCapa);
  }
  function trocarSetor(novoSetor) {
    setSetor(novoSetor);
    const base = {};
    produtos.forEach((p) => { base[p.id] = { ...selecionados[p.id], de: p.precos?.[novoSetor]?.de ?? 0, vista: p.precos?.[novoSetor]?.vista ?? 0, parcelado: p.precos?.[novoSetor]?.parcelado ?? 0 }; });
    setSelecionados(base);
  }
  async function onCapaFile(e, setter) {
    const file = e.target.files?.[0];
    if (!file) return;
    setter(await fileParaDataUrlOtimizado(file));
  }
  function salvar(status) {
    const itens = Object.entries(selecionados).filter(([, v]) => v.on)
      .map(([produtoId, v]) => ({ produtoId, precoDe: Number(v.de) || 0, precoVista: Number(v.vista) || 0, precoParcelado: Number(v.parcelado) || 0 }));
    if (!nome.trim() || itens.length === 0) { alert("Dê um nome ao catálogo e selecione ao menos 1 produto."); return; }
    if (!dataInicio || !dataFim) { alert("Defina a data de início e de término da validade do catálogo."); return; }
    if (dataFim < dataInicio) { alert("A data de término não pode ser antes da data de início."); return; }
    if (editandoId) {
      setCatalogos(catalogos.map((c) => (c.id === editandoId ? { ...c, nome, setor, itens, capa, subtitulo, corDestaque, dataInicio, dataFim } : c)));
    } else {
      const novo = { id: `cat_${Date.now()}`, nome, setor, itens, status, criadoEm: Date.now(), capa, subtitulo, corDestaque, dataInicio, dataFim };
      setCatalogos([novo, ...catalogos]);
    }
    setCriando(false); setEditandoId(null);
  }
  function publicar(id) { setCatalogos(catalogos.map((c) => (c.id === id ? { ...c, status: "publicado" } : c))); }
  function desativar(id) { setCatalogos(catalogos.map((c) => (c.id === id ? { ...c, status: "inativo" } : c))); }
  function reativar(id) { setCatalogos(catalogos.map((c) => (c.id === id ? { ...c, status: "publicado" } : c))); }

  const filtro = useFiltroProdutos(produtos);
  const porCategoria = filtro.filtrados.reduce((acc, p) => { const k = p.categoria || "Outros"; (acc[k] = acc[k] || []).push(p); return acc; }, {});
  const totalSelecionados = Object.values(selecionados).filter((v) => v.on).length;

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-[11px] font-bold uppercase tracking-wide text-stone-400">Catálogos</h2>
        {!criando && (
          <button onClick={iniciarCriacao}
            className="inline-flex items-center gap-1.5 bg-neutral-950 text-white text-xs font-bold uppercase tracking-wide px-3.5 py-2 rounded-md hover:bg-stone-800">
            <Plus size={14} /> Novo catálogo
          </button>
        )}
      </div>

      {criando && (
        <div ref={formRef} className="bg-white border border-stone-200 rounded-xl p-4 mb-5 space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-wide text-stone-500">
            {editandoId ? `Editando: ${nome || "catálogo"}` : "Novo catálogo"}
          </h3>
          <div className="grid sm:grid-cols-2 gap-3">
            <input placeholder="Nome do catálogo (ex: Julho 2026)" value={nome} onChange={(e) => setNome(e.target.value)}
              className="border border-stone-300 rounded-lg px-3 py-2 text-sm" />
            <select value={setor} onChange={(e) => trocarSetor(e.target.value)} className="border border-stone-300 rounded-lg px-3 py-2 text-sm">
              <option value="farm">Setor: Farm</option>
              <option value="primeira">Setor: 1º Compra</option>
            </select>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] text-stone-400 block mb-1">Início da validade</label>
              <input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)}
                className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-[11px] text-stone-400 block mb-1">Término da validade</label>
              <input type="date" value={dataFim} min={dataInicio || undefined} onChange={(e) => setDataFim(e.target.value)}
                className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>
          <div className="grid sm:grid-cols-[auto_1fr_auto] gap-3 items-center bg-stone-50 rounded-lg p-3">
            <div className="flex items-center gap-3">
              <div className="w-16 h-16 rounded-lg border border-dashed border-stone-300 bg-white overflow-hidden flex items-center justify-center shrink-0">
                {capa ? <img src={capa} alt="Capa" className="w-full h-full object-cover" /> : <span className="text-stone-300 text-[10px] text-center px-1">Sem capa</span>}
              </div>
              <div>
                <label className="text-[11px] text-stone-400 block mb-1">Capa do catálogo</label>
                <input type="file" accept="image/*" onChange={(e) => onCapaFile(e, setCapa)}
                  className="text-xs text-stone-500 file:mr-2 file:py-1 file:px-2 file:rounded-md file:border-0 file:bg-stone-900 file:text-white file:text-[11px]" />
              </div>
            </div>
            <div>
              <label className="text-[11px] text-stone-400 block mb-1">Subtítulo (aparece no topo do catálogo)</label>
              <input placeholder="Escolha seus suplementos e envie seu pedido" value={subtitulo} onChange={(e) => setSubtitulo(e.target.value)}
                className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-[11px] text-stone-400 block mb-1">Cor de destaque</label>
              <input type="color" value={corDestaque} onChange={(e) => setCorDestaque(e.target.value)}
                className="w-14 h-9 border border-stone-300 rounded-lg cursor-pointer" />
            </div>
          </div>
          <div className="flex items-center justify-between gap-3">
            <FiltroProdutosBar f={filtro} placeholder="Buscar produto por nome…" />
            <span className="text-[11px] font-bold text-stone-400 whitespace-nowrap shrink-0 -mt-3">
              {totalSelecionados} selecionado{totalSelecionados === 1 ? "" : "s"}
            </span>
          </div>
          <p className="text-[11px] text-stone-400 -mt-1">
            Preço por produto: <b>De</b> (opcional, riscado) · <b>Por</b> (no cartão) · <b>À vista</b> ·
            bolinha = saúde da margem (verde/amarelo/vermelho) · <b>⚠</b> = preço não bate com a fórmula do produto
          </p>
          <div className="space-y-4 max-h-96 overflow-auto pr-1">
            {filtro.filtrados.length === 0 && (
              <p className="text-stone-400 text-sm text-center py-6">Nenhum produto encontrado com esse filtro.</p>
            )}
            {Object.entries(porCategoria).map(([cat, itens]) => (
              <div key={cat}>
                <h4 className="text-xs font-bold uppercase text-stone-400 mb-1.5">{cat}</h4>
                <div className="space-y-1.5">
                  {itens.map((p) => {
                    const sel = selecionados[p.id] || {};
                    const calc = calcularPrecoSetor({ de: sel.de, desconto: p.precos?.[setor]?.desconto, custo: p.custo });
                    const bate = Math.abs(round2(sel.parcelado || 0) - calc.por) < 0.01 && Math.abs(round2(sel.vista || 0) - calc.vista) < 0.01;
                    const vistaDigitado = round2(sel.vista || 0);
                    const margemReal = round2(vistaDigitado - round2(p.custo || 0));
                    const margemRealPct = vistaDigitado > 0 ? round2((margemReal / vistaDigitado) * 100) : 0;
                    const corReal = corMargem(margemRealPct);
                    const dica = `Margem com o preço à vista digitado: ${formatBRL(margemReal)} (${formatPct(margemRealPct)}) — ${corReal.label}.\n`
                      + `Esperado pela fórmula (desconto de ${p.precos?.[setor]?.desconto || 0}% cadastrado no produto): `
                      + `Por ${formatBRL(calc.por)} · À vista ${formatBRL(calc.vista)}`;
                    return (
                    <label key={p.id} className={`flex items-center gap-3 border rounded-lg px-3 py-2 text-sm cursor-pointer flex-wrap ${selecionados[p.id]?.on ? "border-orange-400 bg-orange-50" : "border-stone-200"}`}>
                      <input type="checkbox" checked={!!selecionados[p.id]?.on}
                        onChange={(e) => setSelecionados({ ...selecionados, [p.id]: { ...selecionados[p.id], on: e.target.checked } })} />
                      <span className="flex-1 min-w-[140px]">{p.emoji} {p.nome} <span className="text-stone-400">({p.gramatura})</span></span>
                      <div className="flex flex-col items-center">
                        <span className="text-[9px] text-stone-400 uppercase font-bold leading-none mb-0.5">De</span>
                        <input type="number" step="0.01" value={selecionados[p.id]?.de ?? 0}
                          onChange={(e) => setSelecionados({ ...selecionados, [p.id]: { ...selecionados[p.id], de: e.target.value } })}
                          className="w-20 border border-stone-300 rounded px-2 py-1 text-xs font-mono" title="Preço De (opcional)" />
                      </div>
                      <div className="flex flex-col items-center">
                        <span className="text-[9px] text-stone-400 uppercase font-bold leading-none mb-0.5">Por</span>
                        <input type="number" step="0.01" value={selecionados[p.id]?.parcelado ?? 0}
                          onChange={(e) => setSelecionados({ ...selecionados, [p.id]: { ...selecionados[p.id], parcelado: e.target.value } })}
                          className={`w-20 border rounded px-2 py-1 text-xs font-mono ${bate ? "border-stone-300" : "border-amber-400 bg-amber-50"}`} title="Preço Por" />
                      </div>
                      <div className="flex flex-col items-center">
                        <span className="text-[9px] text-stone-400 uppercase font-bold leading-none mb-0.5">À vista</span>
                        <input type="number" step="0.01" value={selecionados[p.id]?.vista ?? 0}
                          onChange={(e) => setSelecionados({ ...selecionados, [p.id]: { ...selecionados[p.id], vista: e.target.value } })}
                          className={`w-20 border rounded px-2 py-1 text-xs font-mono ${bate ? "border-stone-300" : "border-amber-400 bg-amber-50"}`} title="Preço à vista" />
                      </div>
                      <span className={`inline-flex items-center gap-1 shrink-0 ${bate ? "" : "opacity-70"}`} title={dica}>
                        <span className={`w-2.5 h-2.5 rounded-full ${corReal.dot}`} />
                        {!bate && <span className="text-amber-600 text-xs">⚠</span>}
                      </span>
                    </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            {editandoId ? (
              <button onClick={() => salvar()} className="bg-neutral-950 text-white text-xs font-bold uppercase tracking-wide px-4 py-2 rounded-md">Salvar alterações</button>
            ) : (
              <>
                <button onClick={() => salvar("publicado")} className="bg-neutral-950 text-white text-xs font-bold uppercase tracking-wide px-4 py-2 rounded-md">Publicar catálogo</button>
                <button onClick={() => salvar("rascunho")} className="border border-stone-300 text-stone-600 text-xs font-bold uppercase tracking-wide px-4 py-2 rounded-md">Salvar rascunho</button>
              </>
            )}
            <button onClick={() => { setCriando(false); setEditandoId(null); }} className="text-stone-500 text-xs px-4 py-2">Cancelar</button>
          </div>
        </div>
      )}

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {catalogos.length === 0 && <p className="text-stone-400 text-sm col-span-full">Nenhum catálogo criado ainda.</p>}
        {catalogos.map((cat) => {
          const consultoresDoSetor = consultores.filter((c) => c.setor === cat.setor);
          const publicado = cat.status === "publicado";
          const inativo = cat.status === "inativo";
          const rascunho = !publicado && !inativo;
          const diasValidade = cat.dataFim ? diasParaExpirar(cat.dataFim) : null;
          const expirou = diasValidade !== null && diasValidade < 0;
          const statusInfo = publicado
            ? { dot: "bg-emerald-500", texto: "text-emerald-600", label: "Publicado" }
            : inativo
            ? { dot: "bg-red-400", texto: "text-red-500", label: "Inativo" }
            : { dot: "bg-stone-300", texto: "text-stone-400", label: "Rascunho" };
          return (
            <div key={cat.id} className={`bg-white border rounded-xl p-4 border-l-4 ${publicado ? "border-l-lime-400 border-stone-200" : inativo ? "border-l-red-300 border-stone-200" : "border-l-stone-300 border-stone-200"} ${inativo ? "opacity-70" : ""}`}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg border border-dashed border-stone-300 bg-stone-50 overflow-hidden flex items-center justify-center shrink-0">
                  {catalogoCapaSrc(cat) ? <img src={catalogoCapaSrc(cat)} alt="Capa" loading="lazy" className="w-full h-full object-cover" /> : <span className="w-2 h-2 rounded-full" style={{ backgroundColor: cat.corDestaque || CATALOGO_COR_PADRAO }} />}
                </div>
                <div className="min-w-0">
                  <div className="text-[10px] font-bold uppercase tracking-wide text-stone-400">{SETORES[cat.setor]}</div>
                  <div className="font-bold text-sm truncate">{cat.nome}</div>
                </div>
              </div>
              <div className="text-xs text-stone-400 mt-2">{cat.itens.length} produtos</div>
              {cat.dataFim && (() => {
                const perto = publicado && diasValidade >= 0 && diasValidade <= DIAS_AVISO_EXPIRACAO;
                return (
                  <div className={`text-[11px] mt-1 ${expirou ? "text-red-500 font-semibold" : perto ? "text-amber-600 font-semibold" : "text-stone-400"}`}>
                    Válido {formatDataBR(cat.dataInicio)} – {formatDataBR(cat.dataFim)}
                    {expirou && " · Expirado"}
                    {perto && ` · Expira em ${diasValidade === 0 ? "hoje" : diasValidade === 1 ? "1 dia" : `${diasValidade} dias`}`}
                  </div>
                );
              })()}
              <div className="flex items-center gap-1.5 mt-2.5">
                <span className={`w-1.5 h-1.5 rounded-full ${statusInfo.dot}`} />
                <span className={`text-[10px] font-bold uppercase tracking-wide ${statusInfo.texto}`}>{statusInfo.label}</span>
              </div>
              <div className="flex gap-1.5 mt-3 flex-wrap">
                {rascunho && (
                  <button onClick={() => publicar(cat.id)} className="text-[11px] font-bold uppercase tracking-wide border border-stone-300 rounded-md px-2.5 py-1.5 hover:bg-stone-50">Publicar</button>
                )}
                {publicado && (
                  <>
                    <button onClick={() => setExpandido(expandido === cat.id ? null : cat.id)}
                      className="text-[11px] font-bold uppercase tracking-wide border border-stone-300 rounded-md px-2.5 py-1.5 hover:bg-stone-50">
                      {expandido === cat.id ? "Ocultar" : "Links"}
                    </button>
                    <button onClick={() => { if (confirm(`Desativar "${cat.nome}"? Os links já enviados deixam de funcionar e ele some do painel dos consultores.`)) desativar(cat.id); }}
                      className="text-[11px] font-bold uppercase tracking-wide border border-red-200 text-red-600 rounded-md px-2.5 py-1.5 hover:bg-red-50">
                      Desativar
                    </button>
                  </>
                )}
                {inativo && !expirou && (
                  <button onClick={() => reativar(cat.id)} className="text-[11px] font-bold uppercase tracking-wide border border-orange-200 text-orange-700 rounded-md px-2.5 py-1.5 hover:bg-orange-50">
                    Reativar
                  </button>
                )}
                {inativo && expirou && (
                  <span className="text-[11px] text-stone-400 italic self-center">Edite e estenda a validade pra reativar</span>
                )}
                <button onClick={() => iniciarEdicao(cat)}
                  className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide border border-stone-300 rounded-md px-2.5 py-1.5 hover:bg-stone-50">
                  <Pencil size={11} /> Editar
                </button>
              </div>

              {expandido === cat.id && publicado && (
                <div className="mt-3 pt-3 border-t border-stone-100 space-y-1.5">
                  {consultoresDoSetor.length === 0 && <p className="text-[11px] text-stone-400">Nenhum consultor nesse setor.</p>}
                  {consultoresDoSetor.map((c) => {
                    const link = `${linkBase()}#/c/${cat.id}/${c.id}`;
                    return (
                      <div key={c.id} className="text-[11px] bg-stone-50 rounded-md px-2 py-1.5">
                        <div className="font-semibold mb-1">{c.nome}</div>
                        <div className="flex items-center gap-2">
                          <button onClick={() => { navigator.clipboard?.writeText(link); setCopiado(c.id); setTimeout(() => setCopiado(null), 1200); }}
                            className="inline-flex items-center gap-1 text-stone-500 hover:text-stone-900">
                            {copiado === c.id ? <Check size={11} /> : <Copy size={11} />} {copiado === c.id ? "Copiado" : "Link"}
                          </button>
                          <button onClick={() => onSimular(cat.id, c.id)} className="inline-flex items-center gap-1 text-orange-700 hover:text-orange-900 font-semibold">
                            <Eye size={11} /> Simular
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}


// --- Painel > Seções curadas (título/descrição/ativo/ordem por setor) ---
// A cor de cada seção fica ligada à chave do badge; chaves novas (criadas pelo gerente)
// caem no cinza neutro do fallback abaixo até alguém adicionar uma cor dedicada.
const SECOES_COR = {
  marca_exclusiva: "bg-orange-500",
  lancamento: "bg-sky-500",
  oferta: "bg-violet-500",
  mais_vendido: "bg-amber-500",
};

function SecoesSection({ secoes, atualizarSecao, criarSecao }) {
  return (
    <section>
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-[11px] font-bold uppercase tracking-wide text-stone-400">Seções curadas do catálogo</h2>
      </div>
      <p className="text-xs text-stone-400 mb-4 max-w-2xl">
        Título, descrição, se aparece e em que ordem — pra cada setor. Criar uma seção nova não mexe nas que já
        estão vigentes na vitrine — cada uma vive separada.
        O título daqui é o que aparece como selo pra marcar em cada produto (Painel &gt; Produtos) — renomeie a seção primeiro, depois marque os produtos com esse selo.
      </p>
      <div className="grid lg:grid-cols-2 gap-4">
        {["primeira", "farm"].map((setor) => (
          <SetorSecoes key={setor} setor={setor}
            secoes={secoes.filter((s) => s.setor === setor).sort((a, b) => a.ordem - b.ordem)}
            atualizarSecao={atualizarSecao} criarSecao={criarSecao} />
        ))}
      </div>
    </section>
  );
}

function SetorSecoes({ setor, secoes, atualizarSecao, criarSecao }) {
  const [criando, setCriando] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  function mover(index, delta) {
    const alvo = secoes[index];
    const vizinho = secoes[index + delta];
    if (!alvo || !vizinho) return;
    atualizarSecao(alvo.id, { ...alvo, ordem: vizinho.ordem });
    atualizarSecao(vizinho.id, { ...vizinho, ordem: alvo.ordem });
  }

  async function salvarNova() {
    if (!titulo.trim()) return;
    setSalvando(true);
    setErro("");
    try {
      const proximaOrdem = secoes.length ? Math.max(...secoes.map((s) => s.ordem)) + 1 : 0;
      await criarSecao({ setor, chave: titulo, titulo: titulo.trim(), ordem: proximaOrdem, ativo: true });
      setTitulo("");
      setCriando(false);
    } catch (e) {
      setErro(e.message || "Não deu pra criar a seção.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="bg-white border border-stone-200 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-bold uppercase tracking-wide text-stone-500">{SETORES[setor]}</h3>
        {!criando && (
          <button onClick={() => setCriando(true)}
            className="text-[11px] font-bold uppercase tracking-wide text-stone-500 hover:text-stone-800 flex items-center gap-1">
            <Plus size={12} /> Nova seção
          </button>
        )}
      </div>
      <div className="space-y-2.5">
        {secoes.map((s, i) => (
          <SecaoCard key={s.id} secao={s} atualizarSecao={atualizarSecao}
            onSubir={i > 0 ? () => mover(i, -1) : null}
            onDescer={i < secoes.length - 1 ? () => mover(i, 1) : null} />
        ))}
        {criando && (
          <div className="border border-dashed border-stone-300 rounded-lg p-3 space-y-2">
            <input value={titulo} onChange={(e) => setTitulo(e.target.value)} autoFocus
              placeholder="Título da nova seção"
              className="w-full text-sm border border-stone-200 rounded px-2 py-1.5" />
            {erro && <p className="text-[11px] text-red-600">{erro}</p>}
            <div className="flex items-center gap-2">
              <button onClick={salvarNova} disabled={!titulo.trim() || salvando}
                className="text-[11px] font-bold uppercase tracking-wide rounded-md px-2.5 py-1 border border-stone-800 bg-stone-800 text-white disabled:opacity-40">
                {salvando ? "Criando…" : "Criar"}
              </button>
              <button onClick={() => { setCriando(false); setTitulo(""); setErro(""); }}
                className="text-[11px] font-bold uppercase tracking-wide text-stone-400 hover:text-stone-700 px-2.5 py-1">
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SecaoCard({ secao, atualizarSecao, onSubir, onDescer }) {
  const [titulo, setTitulo] = useState(secao.titulo);
  const [descricao, setDescricao] = useState(secao.descricao || "");

  useEffect(() => { setTitulo(secao.titulo); setDescricao(secao.descricao || ""); }, [secao.titulo, secao.descricao]);

  function salvarTitulo() { if (titulo.trim() && titulo !== secao.titulo) atualizarSecao(secao.id, { ...secao, titulo }); }
  function salvarDescricao() { if (descricao !== (secao.descricao || "")) atualizarSecao(secao.id, { ...secao, descricao }); }

  return (
    <div className={`border rounded-lg p-3 ${secao.ativo ? "border-stone-200" : "border-stone-200 opacity-60"}`}>
      <div className="flex items-start gap-2">
        <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${SECOES_COR[secao.chave] || "bg-stone-400"}`} />
        <div className="flex-1 min-w-0 space-y-1.5">
          <input value={titulo} onChange={(e) => setTitulo(e.target.value)} onBlur={salvarTitulo}
            className="w-full font-bold text-sm border border-transparent hover:border-stone-200 focus:border-stone-300 rounded px-1.5 py-1 -mx-1.5" />
          <textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} onBlur={salvarDescricao} rows={2}
            className="w-full text-xs text-stone-500 border border-transparent hover:border-stone-200 focus:border-stone-300 rounded px-1.5 py-1 -mx-1.5 resize-none" />
        </div>
        <div className="flex flex-col items-center gap-1 shrink-0">
          <button disabled={!onSubir} onClick={onSubir} title="Mover pra cima"
            className="p-0.5 text-stone-400 hover:text-stone-800 disabled:opacity-20 disabled:hover:text-stone-400">
            <ChevronUp size={14} />
          </button>
          <button disabled={!onDescer} onClick={onDescer} title="Mover pra baixo"
            className="p-0.5 text-stone-400 hover:text-stone-800 disabled:opacity-20 disabled:hover:text-stone-400">
            <ChevronDown size={14} />
          </button>
        </div>
      </div>
      <div className="flex items-center justify-between mt-2">
        <span className="text-[10px] font-bold uppercase tracking-wide text-stone-400">
          {secao.ativo ? "Aparece no catálogo" : "Oculta do catálogo"}
        </span>
        <button onClick={() => atualizarSecao(secao.id, { ...secao, ativo: !secao.ativo })}
          className={`text-[11px] font-bold uppercase tracking-wide rounded-md px-2.5 py-1 border ${secao.ativo ? "border-emerald-200 text-emerald-700 hover:bg-emerald-50" : "border-stone-300 text-stone-500 hover:bg-stone-50"}`}>
          {secao.ativo ? "Ativa" : "Ativar"}
        </button>
      </div>
    </div>
  );
}

// --- Painel > Produtos ---
function ProdutosSection({ produtos, setProdutos, envios, secoes }) {
  const [editing, setEditing] = useState(null);
  const imagemRequestRef = useRef(0); // descarta a busca da imagem se o usuário trocar de produto antes dela terminar
  const blank = { nome: "", gramatura: "", categoria: "", descricao: "", emoji: "📦", imagem: "", ativo: true,
    marca: "", sabores: [], custo: "", badges: [], notaPromo: "",
    precos: { primeira: { de: "", desconto: "", parcelado: "", vista: "" }, farm: { de: "", desconto: "", parcelado: "", vista: "" } } };

  const filtro = useFiltroProdutos(produtos);

  // O selo do cadastro é sempre o título atual da seção — marcar o selo é o que coloca o
  // produto naquela seção do catálogo (ver porBadge em CatalogoPublico). Deduplicado por chave
  // porque a mesma seção existe uma vez por setor (farm/1º compra) com o mesmo título.
  const selosDisponiveis = useMemo(() => {
    const vistos = new Set();
    return (secoes || []).filter((s) => {
      if (vistos.has(s.chave)) return false;
      vistos.add(s.chave);
      return true;
    });
  }, [secoes]);

  const vezesPedido = useMemo(() => {
    const m = {};
    envios.forEach((e) => (e.pedidoDetalhe?.itens || []).forEach((it) => { m[it.produtoId] = (m[it.produtoId] || 0) + it.quantidade; }));
    return m;
  }, [envios]);

  function salvar(prod) {
    if (prod.id) setProdutos(produtos.map((p) => (p.id === prod.id ? prod : p)));
    else setProdutos([...produtos, { ...prod, id: `p_${Date.now()}` }]);
    setEditing(null);
  }
  function remover(id) { if (confirm("Remover este produto?")) setProdutos(produtos.filter((p) => p.id !== id)); }
  // Imagem não vem mais na listagem (ver server/routes/produtos.js) — busca só ao entrar na edição.
  const [carregandoImagem, setCarregandoImagem] = useState(false);
  async function editar(p) {
    // Só monta o formulário quando a foto real já chegou — ProdutoForm guarda o estado inicial
    // uma única vez (useState), então abrir o form antes com imagem vazia "congela" esse vazio:
    // ele nunca é atualizado depois, e salvar manda imagem="" por cima da foto que já existia.
    const requestId = ++imagemRequestRef.current;
    setEditing(null);
    setCarregandoImagem(true);
    const imagem = p.temImagem ? await urlParaDataUrl(api.produtos.imagemUrl(p.id)) : "";
    // Se o usuário já trocou de produto (ou cancelou) antes da busca terminar, descarta o resultado.
    if (imagemRequestRef.current !== requestId) return;
    setCarregandoImagem(false);
    setEditing({ ...p, imagem });
  }
  function cancelarEdicao() {
    imagemRequestRef.current += 1; // descarta qualquer busca de imagem pendente
    setCarregandoImagem(false);
    setEditing(null);
  }

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-[11px] font-bold uppercase tracking-wide text-stone-400">
          Produtos <span className="text-stone-300 font-normal normal-case">({filtro.filtrados.length} de {produtos.length})</span>
        </h2>
        <button onClick={() => { imagemRequestRef.current += 1; setCarregandoImagem(false); setEditing(blank); }}
          className="inline-flex items-center gap-1.5 bg-orange-400 text-neutral-950 text-xs font-bold uppercase tracking-wide px-3.5 py-2 rounded-md hover:bg-orange-300">
          <Plus size={14} /> Novo produto
        </button>
      </div>

      {carregandoImagem && (
        <div className="bg-white border border-stone-200 rounded-xl p-4 mb-4 text-xs text-stone-400">
          Carregando produto…
        </div>
      )}
      {editing && !carregandoImagem && <ProdutoForm inicial={editing} onSalvar={salvar} onCancelar={cancelarEdicao} selos={selosDisponiveis} />}

      <FiltroProdutosBar f={filtro} />

      <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-stone-50 text-stone-400 text-[11px] uppercase tracking-wide">
            <tr>
              <th className="text-left px-4 py-2.5 font-bold w-10"></th>
              <th className="text-left px-4 py-2.5 font-bold">Produto</th>
              <th className="text-left px-4 py-2.5 font-bold">Marca</th>
              <th className="text-left px-4 py-2.5 font-bold">Categoria</th>
              <th className="text-right px-4 py-2.5 font-bold">Preço (1ª / Farm)</th>
              <th className="text-center px-4 py-2.5 font-bold">Margem (1ª / Farm)</th>
              <th className="text-right px-4 py-2.5 font-bold">Vezes pedido</th>
              <th className="px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {filtro.filtrados.map((p) => (
              <tr key={p.id} className="border-t border-stone-100">
                <td className="px-4 py-2.5">
                  {produtoImgSrc(p) ? (
                    <div className="w-8 h-8 rounded-md bg-stone-100 flex items-center justify-center overflow-hidden">
                      <img src={produtoImgSrc(p)} alt={p.nome} loading="lazy" className="w-full h-full object-contain" />
                    </div>
                  ) : (
                    <span className="text-xl">{p.emoji}</span>
                  )}
                </td>
                <td className="px-4 py-2.5">
                  <div className="font-semibold">{p.nome}</div>
                  <div className="text-[11px] text-stone-400">{[p.gramatura, (p.sabores || []).join(", ")].filter(Boolean).join(" · ")}</div>
                </td>
                <td className="px-4 py-2.5 text-stone-500">{p.marca || "—"}</td>
                <td className="px-4 py-2.5 text-stone-500">{p.categoria}</td>
                <td className="px-4 py-2.5 text-right font-mono text-xs">{formatBRL(p.precos?.primeira?.vista)} / {formatBRL(p.precos?.farm?.vista)}</td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center justify-center gap-2">
                    {["primeira", "farm"].map((setor) => {
                      const vista = round2(p.precos?.[setor]?.vista || 0);
                      const margemPct = vista > 0 ? round2(((vista - round2(p.custo || 0)) / vista) * 100) : 0;
                      const cor = corMargem(margemPct);
                      return (
                        <span key={setor} className={`w-2.5 h-2.5 rounded-full ${vista > 0 ? cor.dot : "bg-stone-200"}`}
                          title={`${SETORES[setor]}: ${vista > 0 ? `margem ${formatPct(margemPct)} — ${cor.label}` : "sem preço"}`} />
                      );
                    })}
                  </div>
                </td>
                <td className="px-4 py-2.5 text-right font-mono">{vezesPedido[p.id] || 0}</td>
                <td className="px-4 py-2.5">
                  <div className="flex justify-end gap-1">
                    <button onClick={() => editar(p)} className="p-1.5 text-stone-400 hover:text-stone-700"><Pencil size={14} /></button>
                    <button onClick={() => remover(p.id)} className="p-1.5 text-stone-400 hover:text-red-600"><Trash2 size={14} /></button>
                  </div>
                </td>
              </tr>
            ))}
            {produtos.length === 0 && <tr><td colSpan={8} className="px-4 py-6 text-center text-stone-400 text-sm">Nenhum produto cadastrado.</td></tr>}
            {produtos.length > 0 && filtro.filtrados.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-6 text-center text-stone-400 text-sm">Nenhum produto encontrado com esse filtro.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ProdutoForm({ inicial, onSalvar, onCancelar, selos }) {
  const [f, setF] = useState(inicial);
  const setPreco = (setor, tipo, val) => setF({ ...f, precos: { ...f.precos, [setor]: { ...f.precos[setor], [tipo]: val } } });
  const toggleBadge = (b) => setF({ ...f, badges: f.badges?.includes(b) ? f.badges.filter((x) => x !== b) : [...(f.badges || []), b] });
  async function onImagemFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const dataUrl = await fileParaDataUrlOtimizado(file);
    setF((cur) => ({ ...cur, imagem: dataUrl }));
  }
  const [novoSabor, setNovoSabor] = useState("");
  function adicionarSabor() {
    const v = novoSabor.trim();
    if (!v || (f.sabores || []).includes(v)) { setNovoSabor(""); return; }
    setF({ ...f, sabores: [...(f.sabores || []), v] });
    setNovoSabor("");
  }
  function removerSabor(s) { setF({ ...f, sabores: (f.sabores || []).filter((x) => x !== s) }); }
  function usarCalculado(setor) {
    const calc = calcularPrecoSetor({ de: f.precos[setor].de, desconto: f.precos[setor].desconto, custo: f.custo });
    setF({ ...f, precos: { ...f.precos, [setor]: { ...f.precos[setor], parcelado: calc.por, vista: calc.vista } } });
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSalvar({ ...f, custo: Number(f.custo) || 0, precos: {
      primeira: { de: Number(f.precos.primeira.de) || 0, desconto: Number(f.precos.primeira.desconto) || 0, parcelado: Number(f.precos.primeira.parcelado) || 0, vista: Number(f.precos.primeira.vista) || 0 },
      farm: { de: Number(f.precos.farm.de) || 0, desconto: Number(f.precos.farm.desconto) || 0, parcelado: Number(f.precos.farm.parcelado) || 0, vista: Number(f.precos.farm.vista) || 0 },
    } }); }}
      className="bg-white border border-stone-200 rounded-xl p-4 mb-4 space-y-3">
      <div className="grid sm:grid-cols-4 gap-3">
        <div className="sm:col-span-2">
          <label className="text-[11px] text-stone-400 block mb-1">Nome do produto</label>
          <input required value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })}
            className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="text-[11px] text-stone-400 block mb-1">Gramatura</label>
          <input value={f.gramatura} onChange={(e) => setF({ ...f, gramatura: e.target.value })}
            className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="text-[11px] text-stone-400 block mb-1">Categoria</label>
          <input list="cats" value={f.categoria} onChange={(e) => setF({ ...f, categoria: e.target.value })}
            className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm" />
          <datalist id="cats">{CATEGORIA_SUGESTOES.map((c) => <option key={c} value={c} />)}</datalist>
        </div>
      </div>
      <div>
        <label className="text-[11px] text-stone-400 block mb-1">Descrição</label>
        <textarea value={f.descricao} onChange={(e) => setF({ ...f, descricao: e.target.value })}
          className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm" rows={2} />
      </div>
      <div className="flex items-center gap-3 bg-stone-50 rounded-lg p-3">
        <div className="w-14 h-14 rounded-lg border border-dashed border-stone-300 bg-white overflow-hidden flex items-center justify-center shrink-0">
          {f.imagem ? <img src={f.imagem} alt="Produto" className="w-full h-full object-contain" /> : <span className="text-2xl">{f.emoji}</span>}
        </div>
        <div>
          <label className="text-[11px] text-stone-400 block mb-1">Foto do produto (opcional — sem foto, usa o ícone)</label>
          <div className="flex items-center gap-2">
            <input type="file" accept="image/*" onChange={onImagemFile}
              className="text-xs text-stone-500 file:mr-2 file:py-1 file:px-2 file:rounded-md file:border-0 file:bg-stone-900 file:text-white file:text-[11px]" />
            {f.imagem && <button type="button" onClick={() => setF({ ...f, imagem: "" })} className="text-[11px] text-stone-400 hover:text-red-600">Remover</button>}
          </div>
        </div>
      </div>
      <div className="grid sm:grid-cols-4 gap-3">
        <div>
          <label className="text-[11px] text-stone-400 block mb-1">Ícone (emoji)</label>
          <input value={f.emoji} onChange={(e) => setF({ ...f, emoji: e.target.value })}
            className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="text-[11px] text-stone-400 block mb-1">Marca (opcional)</label>
          <input value={f.marca} onChange={(e) => setF({ ...f, marca: e.target.value })}
            className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="text-[11px] text-stone-400 block mb-1">Custo (R$)</label>
          <input type="number" step="0.01" value={f.custo ?? ""} onChange={(e) => setF({ ...f, custo: e.target.value })}
            className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm font-mono" title="Custo do produto, usado pra calcular a margem" />
        </div>
        <div>
          <label className="text-[11px] text-stone-400 block mb-1">Nota promocional (opcional)</label>
          <input value={f.notaPromo} onChange={(e) => setF({ ...f, notaPromo: e.target.value })}
            className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm" />
        </div>
      </div>
      <div>
        <label className="text-[11px] text-stone-400 block mb-1.5">
          Sabores (opcional — se o produto tiver 2 ou mais, o cliente escolhe a quantidade de cada um no catálogo)
        </label>
        <div className="flex flex-wrap gap-2 mb-2">
          {(f.sabores || []).map((s) => (
            <span key={s} className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-stone-900 text-white">
              {s}
              <button type="button" onClick={() => removerSabor(s)} className="hover:text-red-300"><X size={11} /></button>
            </span>
          ))}
          {(f.sabores || []).length === 0 && <span className="text-[11px] text-stone-400">Nenhum sabor cadastrado — produto sem variação de sabor.</span>}
        </div>
        <div className="flex gap-2">
          <input value={novoSabor} onChange={(e) => setNovoSabor(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); adicionarSabor(); } }}
            placeholder="Ex: Chocolate" className="flex-1 border border-stone-300 rounded-lg px-3 py-2 text-sm" />
          <button type="button" onClick={adicionarSabor}
            className="border border-stone-300 text-stone-600 text-xs font-bold uppercase tracking-wide px-3.5 py-2 rounded-md hover:bg-stone-50">
            Adicionar
          </button>
        </div>
      </div>
      <div>
        <label className="text-[11px] text-stone-400 block mb-1.5">Selos (aparecem na página do cliente)</label>
        <div className="flex flex-wrap gap-2">
          {(selos || []).map((s) => (
            <button key={s.chave} type="button" onClick={() => toggleBadge(s.chave)}
              className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${f.badges?.includes(s.chave) ? "bg-stone-900 text-white border-stone-900" : "border-stone-300 text-stone-500"}`}>
              {s.titulo}
            </button>
          ))}
        </div>
      </div>
      <div className="grid sm:grid-cols-2 gap-4 pt-2">
        {["primeira", "farm"].map((setor) => {
          const sp = f.precos[setor];
          const calc = calcularPrecoSetor({ de: sp.de, desconto: sp.desconto, custo: f.custo });
          const porBate = Math.abs(round2(sp.parcelado || 0) - calc.por) < 0.01;
          const vistaBate = Math.abs(round2(sp.vista || 0) - calc.vista) < 0.01;
          return (
            <div key={setor} className="bg-stone-50 rounded-lg p-3">
              <div className="text-xs font-bold text-stone-500 mb-2">{SETORES[setor]}</div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] text-stone-400">De (R$)</label>
                  <input type="number" step="0.01" value={sp.de ?? ""} onChange={(e) => setPreco(setor, "de", e.target.value)}
                    className="w-full border border-stone-300 rounded-lg px-2 py-1.5 text-sm font-mono" title="Preço original, base do desconto" />
                </div>
                <div>
                  <label className="text-[11px] text-stone-400">Desconto (%)</label>
                  <input type="number" step="0.01" value={sp.desconto ?? ""} onChange={(e) => setPreco(setor, "desconto", e.target.value)}
                    className="w-full border border-stone-300 rounded-lg px-2 py-1.5 text-sm font-mono" title="Aplicado sobre o preço De" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 mt-2">
                <div>
                  <label className={`text-[11px] ${porBate ? "text-stone-400" : "text-amber-600 font-bold"}`}>Por (R$)</label>
                  <input type="number" step="0.01" value={sp.parcelado} onChange={(e) => setPreco(setor, "parcelado", e.target.value)}
                    className={`w-full border rounded-lg px-2 py-1.5 text-sm font-mono ${porBate ? "border-stone-300" : "border-amber-400 bg-amber-50"}`} />
                </div>
                <div>
                  <label className={`text-[11px] ${vistaBate ? "text-stone-400" : "text-amber-600 font-bold"}`}>À vista (R$)</label>
                  <input type="number" step="0.01" value={sp.vista} onChange={(e) => setPreco(setor, "vista", e.target.value)}
                    className={`w-full border rounded-lg px-2 py-1.5 text-sm font-mono ${vistaBate ? "border-stone-300" : "border-amber-400 bg-amber-50"}`} />
                </div>
              </div>

              <div className="mt-2.5 pt-2.5 border-t border-stone-200 text-[11px] space-y-1">
                <div className="flex justify-between text-stone-500"><span>Valor do desconto</span><span className="font-mono">{formatBRL(calc.valorDesconto)}</span></div>
                <div className={`flex justify-between font-semibold ${porBate ? "text-stone-500" : "text-amber-700"}`}>
                  <span>Por esperado</span><span className="font-mono">{formatBRL(calc.por)} {porBate ? "✓" : "⚠"}</span>
                </div>
                <div className="flex justify-between text-stone-500"><span>3% OFF (sobre o Por)</span><span className="font-mono">{formatBRL(calc.valor3off)}</span></div>
                <div className={`flex justify-between font-semibold ${vistaBate ? "text-stone-500" : "text-amber-700"}`}>
                  <span>À vista esperado</span><span className="font-mono">{formatBRL(calc.vista)} {vistaBate ? "✓" : "⚠"}</span>
                </div>
              </div>
              {(() => {
                const cor = corMargem(calc.margemPct);
                return (
                  <div className={`flex items-center justify-between mt-1.5 rounded-lg border px-2.5 py-1.5 ${cor.fundo} ${cor.borda}`} title={cor.label}>
                    <span className={`flex items-center gap-1.5 text-[11px] font-bold ${cor.texto}`}>
                      <span className={`w-2 h-2 rounded-full ${cor.dot}`} /> Margem (à vista)
                    </span>
                    <span className={`font-mono text-xs font-bold ${cor.texto}`}>{formatBRL(calc.margemReais)} ({formatPct(calc.margemPct)})</span>
                  </div>
                );
              })()}

              {(!porBate || !vistaBate) && (
                <button type="button" onClick={() => usarCalculado(setor)}
                  className="mt-2 text-[11px] font-bold uppercase tracking-wide text-orange-700 hover:text-orange-900">
                  Usar valores calculados
                </button>
              )}
            </div>
          );
        })}
      </div>
      <div className="flex gap-2 pt-1">
        <button type="submit" className="bg-neutral-950 text-white text-xs font-bold uppercase tracking-wide px-4 py-2 rounded-md">Salvar produto</button>
        <button type="button" onClick={onCancelar} className="text-stone-500 text-sm px-4 py-2">Cancelar</button>
      </div>
    </form>
  );
}

// --- Consultores ---
function ConsultoresSection({ consultores, setConsultores, catalogos, envios }) {
  const [editing, setEditing] = useState(null);
  const blank = { nome: "", email: "", whatsapp: "", setor: "farm", senha: "1234" };

  function salvar(c) {
    // Edição sem preencher senha = mantém a senha atual (o backend nunca devolve a senha salva).
    const registro = c.senha ? c : { ...c, senha: undefined };
    if (c.id) setConsultores(consultores.map((x) => (x.id === c.id ? registro : x)));
    else setConsultores([...consultores, { ...registro, id: `c_${Date.now()}` }]);
    setEditing(null);
  }
  function remover(id) { if (confirm("Remover este consultor?")) setConsultores(consultores.filter((x) => x.id !== id)); }

  return (
    <div>
      <div className="flex justify-end mb-3">
        <button onClick={() => setEditing(blank)}
          className="inline-flex items-center gap-1.5 bg-orange-400 text-neutral-950 text-xs font-bold uppercase tracking-wide px-3.5 py-2 rounded-md hover:bg-orange-300">
          <Plus size={14} /> Novo consultor
        </button>
      </div>

      {editing && (
        <form onSubmit={(e) => { e.preventDefault(); salvar(editing); }}
          className="bg-white border border-stone-200 rounded-xl p-4 mb-4 grid sm:grid-cols-5 gap-3 items-end">
          <input required placeholder="Nome" value={editing.nome} onChange={(e) => setEditing({ ...editing, nome: e.target.value })} className="border border-stone-300 rounded-lg px-3 py-2 text-sm" />
          <input placeholder="E-mail" value={editing.email} onChange={(e) => setEditing({ ...editing, email: e.target.value })} className="border border-stone-300 rounded-lg px-3 py-2 text-sm" />
          <input required placeholder="WhatsApp (DDD)" value={editing.whatsapp} onChange={(e) => setEditing({ ...editing, whatsapp: e.target.value })} className="border border-stone-300 rounded-lg px-3 py-2 text-sm" />
          <select value={editing.setor} onChange={(e) => setEditing({ ...editing, setor: e.target.value })} className="border border-stone-300 rounded-lg px-3 py-2 text-sm">
            <option value="farm">Farm</option>
            <option value="primeira">1º Compra</option>
          </select>
          <input placeholder={editing.id ? "Nova senha (deixe em branco p/ manter)" : "Senha"} value={editing.senha || ""}
            onChange={(e) => setEditing({ ...editing, senha: e.target.value })} className="border border-stone-300 rounded-lg px-3 py-2 text-sm" />
          <div className="sm:col-span-5 flex gap-2">
            <button type="submit" className="bg-neutral-950 text-white text-xs font-bold uppercase tracking-wide px-4 py-2 rounded-md">Salvar</button>
            <button type="button" onClick={() => setEditing(null)} className="text-stone-500 text-sm px-4 py-2">Cancelar</button>
          </div>
        </form>
      )}

      <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-stone-50 text-stone-400 text-[11px] uppercase tracking-wide">
            <tr>
              <th className="text-left px-4 py-2.5 font-bold">Consultor</th>
              <th className="text-left px-4 py-2.5 font-bold">E-mail</th>
              <th className="text-left px-4 py-2.5 font-bold">Setor</th>
              <th className="text-left px-4 py-2.5 font-bold">Catálogos</th>
              <th className="px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {consultores.map((c) => {
              const qtdCatalogos = catalogos.filter((cat) => cat.setor === c.setor && cat.status === "publicado").length;
              return (
                <tr key={c.id} className="border-t border-stone-100">
                  <td className="px-4 py-2.5 font-semibold">{c.nome}</td>
                  <td className="px-4 py-2.5 text-stone-500">{c.email || "—"}</td>
                  <td className="px-4 py-2.5">
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${c.setor === "farm" ? "bg-orange-100 text-orange-700" : "bg-amber-100 text-amber-700"}`}>{SETORES[c.setor]}</span>
                  </td>
                  <td className="px-4 py-2.5 text-stone-500">{qtdCatalogos} catálogos</td>
                  <td className="px-4 py-2.5">
                    <div className="flex justify-end gap-1">
                      <button onClick={() => setEditing(c)} className="p-1.5 text-stone-400 hover:text-stone-700"><Pencil size={14} /></button>
                      <button onClick={() => remover(c.id)} className="p-1.5 text-stone-400 hover:text-red-600"><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Rastreamento (compartilhado entre Gerente=todos e Consultor=próprio)
// ---------------------------------------------------------------------------
function RastreamentoView({ consultores, catalogos, envios, buscas, escopo, apenasConsultorId, onSincronizar, sincronizando }) {
  const [filtroConsultor, setFiltroConsultor] = useState("todos");
  const [filtroCatalogo, setFiltroCatalogo] = useState("todos");
  const [filtroStatus, setFiltroStatus] = useState("todos");
  const [periodo, setPeriodo] = useState("todos");
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");

  const consultoresEscopo = escopo === "proprio" ? consultores.filter((c) => c.id === apenasConsultorId) : consultores;
  const idsEscopo = new Set(consultoresEscopo.map((c) => c.id));
  const { de, ate } = useMemo(() => calcularIntervaloPeriodo(periodo, dataInicio, dataFim), [periodo, dataInicio, dataFim]);

  const filtrados = envios.filter((e) => {
    if (!idsEscopo.has(e.consultorId)) return false;
    if (filtroConsultor !== "todos" && e.consultorId !== filtroConsultor) return false;
    if (filtroCatalogo !== "todos" && e.catalogoId !== filtroCatalogo) return false;
    if (filtroStatus === "nao_visualizou" && e.visualizadoEm) return false;
    if (filtroStatus === "visualizou" && !e.visualizadoEm) return false;
    if (filtroStatus === "pediu" && !e.pedidoEm) return false;
    if (de !== null && e.criadoEm < de) return false;
    if (ate !== null && e.criadoEm >= ate) return false;
    return true;
  });

  const linksEnviados = filtrados.length;
  const naoVisualizaram = filtrados.filter((e) => !e.visualizadoEm).length;
  const visualizaram = filtrados.filter((e) => e.visualizadoEm).length;
  const adicionaram = filtrados.filter((e) => e.carrinhoEm).length;
  const pedidos = filtrados.filter((e) => e.pedidoEm).length;
  const taxaAbertura = pct(visualizaram, linksEnviados);
  const taxaConversao = pct(pedidos, linksEnviados);

  const ranking = useMemo(() => {
    const porCatalogo = {};
    filtrados.forEach((e) => { (porCatalogo[e.catalogoId] = porCatalogo[e.catalogoId] || []).push(e); });
    return Object.entries(porCatalogo).map(([catalogoId, lista]) => {
      const cat = catalogos.find((c) => c.id === catalogoId);
      return { catalogo: cat, enviados: lista.length, pedidos: lista.filter((e) => e.pedidoEm).length,
        conversao: pct(lista.filter((e) => e.pedidoEm).length, lista.length) };
    }).filter((r) => r.catalogo).sort((a, b) => b.conversao - a.conversao).slice(0, 4);
  }, [filtrados, catalogos]);

  const porConsultor = useMemo(() => {
    return consultoresEscopo.map((c) => {
      const lista = filtrados.filter((e) => e.consultorId === c.id);
      const viram = lista.filter((e) => e.visualizadoEm).length;
      const ped = lista.filter((e) => e.pedidoEm).length;
      const semRetorno = lista.some((e) => !e.visualizadoEm && Date.now() - e.criadoEm > 2 * DIA_MS);
      return { consultor: c, clientes: lista.length, viram, pedidos: ped,
        abertura: pct(viram, lista.length), conversao: pct(ped, lista.length),
        followUp: lista.length === 0 ? "—" : semRetorno ? "Fazer contato" : "OK" };
    }).sort((a, b) => b.pedidos - a.pedidos);
  }, [consultoresEscopo, filtrados]);

  return (
    <>
      <Hero title="Rastreamento" stats={[
        { label: "Links enviados", value: linksEnviados },
        { label: "Taxa de abertura", value: `${taxaAbertura}%`, color: "text-sky-400" },
        { label: "Taxa de conversão", value: `${taxaConversao}%`, color: "text-orange-400" },
      ]} />

      <div className="max-w-6xl mx-auto px-6 py-8 space-y-8">
        <div className="flex flex-wrap gap-3 items-end bg-white border border-stone-200 rounded-xl p-3.5">
          <div className="flex items-center gap-1.5 text-stone-400 text-xs font-bold uppercase tracking-wide pr-1"><Filter size={13} /> Filtros</div>
          {escopo === "todos" && (
            <select value={filtroConsultor} onChange={(e) => setFiltroConsultor(e.target.value)} className="border border-stone-300 rounded-lg px-2.5 py-1.5 text-xs">
              <option value="todos">Todos os consultores</option>
              {consultoresEscopo.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          )}
          <select value={filtroCatalogo} onChange={(e) => setFiltroCatalogo(e.target.value)} className="border border-stone-300 rounded-lg px-2.5 py-1.5 text-xs">
            <option value="todos">Todos os catálogos</option>
            {catalogos.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
          <select value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)} className="border border-stone-300 rounded-lg px-2.5 py-1.5 text-xs">
            <option value="todos">Todos os status</option>
            <option value="nao_visualizou">Não visualizaram</option>
            <option value="visualizou">Visualizaram</option>
            <option value="pediu">Enviaram pedido</option>
          </select>
          <div className="flex items-end gap-2">
            <div>
              <label className="block text-[10px] text-stone-400 mb-1">Período</label>
              <select value={periodo} onChange={(e) => setPeriodo(e.target.value)} className="border border-stone-300 rounded-lg px-2.5 py-1.5 text-xs">
                {PERIODO_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </div>
            {periodo === "personalizado" && (
              <>
                <div>
                  <label className="block text-[10px] text-stone-400 mb-1">De</label>
                  <input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)}
                    className="border border-stone-300 rounded-lg px-2.5 py-1.5 text-xs" />
                </div>
                <div>
                  <label className="block text-[10px] text-stone-400 mb-1">Até</label>
                  <input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)}
                    className="border border-stone-300 rounded-lg px-2.5 py-1.5 text-xs" />
                </div>
              </>
            )}
          </div>
          <div className="ml-auto flex items-center gap-3">
            {(filtroConsultor !== "todos" || filtroCatalogo !== "todos" || filtroStatus !== "todos" || periodo !== "todos") && (
              <button onClick={() => { setFiltroConsultor("todos"); setFiltroCatalogo("todos"); setFiltroStatus("todos"); setPeriodo("todos"); setDataInicio(""); setDataFim(""); }}
                className="text-xs font-bold uppercase tracking-wide text-stone-500 hover:text-stone-900">Limpar filtros</button>
            )}
            {onSincronizar && (
              <button onClick={onSincronizar} disabled={sincronizando}
                className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide border border-stone-300 rounded-md px-2.5 py-1.5 hover:bg-stone-50 disabled:opacity-50">
                <RefreshCw size={13} className={sincronizando ? "animate-spin" : ""} /> {sincronizando ? "Atualizando…" : "Atualizar"}
              </button>
            )}
          </div>
        </div>

        <div>
          <h2 className="text-[11px] font-bold uppercase tracking-wide text-stone-400 mb-3">Resumo geral — {linksEnviados} clientes</h2>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <ResumoCard value={linksEnviados} label="Links enviados" color="text-stone-900" />
            <ResumoCard value={naoVisualizaram} label="Não visualizaram" color="text-stone-400" />
            <ResumoCard value={visualizaram} label="Visualizaram" color="text-sky-600" />
            <ResumoCard value={adicionaram} label="Adicionaram" color="text-amber-600" />
            <ResumoCard value={pedidos} label="Enviaram pedido" color="text-orange-600" />
          </div>
        </div>

        <div>
          <h2 className="text-[11px] font-bold uppercase tracking-wide text-stone-400 mb-3">Funil de conversão</h2>
          <div className="bg-white border border-stone-200 rounded-xl p-5 space-y-4">
            <FunilBar label="Visualizaram" valor={visualizaram} total={linksEnviados} cor="bg-sky-500" />
            <FunilBar label="Adicionaram" valor={adicionaram} total={linksEnviados} cor="bg-amber-500" />
            <FunilBar label="Enviaram pedido" valor={pedidos} total={linksEnviados} cor="bg-orange-500" />
          </div>
        </div>

        {ranking.length > 0 && (
          <div>
            <h2 className="text-[11px] font-bold uppercase tracking-wide text-stone-400 mb-3">Ranking de catálogos — por taxa de conversão</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {ranking.map((r, i) => (
                <div key={r.catalogo.id} className="bg-white border border-stone-200 rounded-xl p-4">
                  <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wide text-stone-400">
                    <span>{SETORES[r.catalogo.setor]}</span>
                    {i === 0 && <span className="text-orange-600">1º lugar</span>}
                  </div>
                  <div className="font-bold text-sm mt-1">{r.catalogo.nome}</div>
                  <div className="mt-3 space-y-1.5 text-xs">
                    <div className="flex justify-between"><span className="text-stone-400">Taxa de conversão</span><span className="font-mono font-bold">{r.conversao}%</span></div>
                    <div className="flex justify-between"><span className="text-stone-400">Clientes / pedidos</span><span className="font-mono">{r.enviados} / {r.pedidos}</span></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {escopo === "todos" && buscas && buscas.length > 0 && (
          <div>
            <h2 className="text-[11px] font-bold uppercase tracking-wide text-stone-400 mb-3">
              Buscas sem resultado <span className="text-stone-300 font-normal normal-case">— o que os clientes procuraram e não achou no catálogo</span>
            </h2>
            <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-stone-50 text-stone-400 text-[11px] uppercase tracking-wide">
                  <tr>
                    <th className="text-left px-4 py-2.5 font-bold">Termo buscado</th>
                    <th className="text-right px-4 py-2.5 font-bold">Vezes</th>
                    <th className="text-right px-4 py-2.5 font-bold">Última busca</th>
                  </tr>
                </thead>
                <tbody>
                  {buscas.slice(0, 15).map((b) => (
                    <tr key={b.termo} className="border-t border-stone-100">
                      <td className="px-4 py-2.5 font-semibold">{b.termo}</td>
                      <td className="px-4 py-2.5 text-right font-mono">{b.qtd}</td>
                      <td className="px-4 py-2.5 text-right text-stone-400 text-xs">{new Date(b.ultima).toLocaleDateString("pt-BR")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div>
          <h2 className="text-[11px] font-bold uppercase tracking-wide text-stone-400 mb-3">Acompanhamento por consultor</h2>
          <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-stone-50 text-stone-400 text-[11px] uppercase tracking-wide">
                <tr>
                  <th className="text-left px-4 py-2.5 font-bold">Consultor</th>
                  <th className="text-right px-4 py-2.5 font-bold">Clientes</th>
                  <th className="text-right px-4 py-2.5 font-bold">Viram</th>
                  <th className="text-right px-4 py-2.5 font-bold">Pedidos</th>
                  <th className="text-right px-4 py-2.5 font-bold">Abertura</th>
                  <th className="text-right px-4 py-2.5 font-bold">Conversão</th>
                  <th className="text-right px-4 py-2.5 font-bold">Follow-up</th>
                </tr>
              </thead>
              <tbody>
                {porConsultor.map((l) => (
                  <tr key={l.consultor.id} className="border-t border-stone-100">
                    <td className="px-4 py-2.5">
                      <div className="font-semibold">{l.consultor.nome}</div>
                      <div className="text-[11px] text-stone-400">{SETORES[l.consultor.setor]}</div>
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono">{l.clientes}</td>
                    <td className="px-4 py-2.5 text-right font-mono">{l.viram}</td>
                    <td className="px-4 py-2.5 text-right font-mono">{l.pedidos}</td>
                    <td className="px-4 py-2.5 text-right font-mono">{l.abertura}%</td>
                    <td className="px-4 py-2.5 text-right font-mono">{l.conversao}%</td>
                    <td className="px-4 py-2.5 text-right">
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${l.followUp === "Fazer contato" ? "bg-red-100 text-red-700" : l.followUp === "OK" ? "bg-orange-100 text-orange-700" : "text-stone-300"}`}>{l.followUp}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {linksEnviados === 0 && (
          <div className="bg-white border border-stone-200 rounded-xl py-10 text-center text-stone-400 text-sm">
            Nenhum cliente encontrado com os filtros aplicados.
          </div>
        )}
      </div>
    </>
  );
}

function ResumoCard({ value, label, color }) {
  return (
    <div className="bg-white border border-stone-200 rounded-xl p-4">
      <div className={`font-black text-2xl ${color}`}>{value}</div>
      <div className="text-[10px] text-stone-400 uppercase tracking-wide mt-1">{label}</div>
    </div>
  );
}

function FunilBar({ label, valor, total, cor }) {
  const p = pct(valor, total);
  return (
    <div>
      <div className="flex justify-between text-sm mb-1.5"><span>{label}</span><span className="font-mono font-semibold">{valor} ({p}%)</span></div>
      <div className="h-2 bg-stone-100 rounded-full overflow-hidden">
        <div className={`h-full ${cor} rounded-full transition-all`} style={{ width: `${p}%` }} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Consultor
// ---------------------------------------------------------------------------
function ConsultorPanel({ consultor, catalogos, envios, onCriarEnvio, onLogout, onSimular, onAbrirEnvio, onSincronizar, sincronizando }) {
  const [tab, setTab] = useState("painel");
  const tabs = [{ id: "painel", label: "Painel" }, { id: "desempenho", label: "Desempenho" }];
  const meusCatalogos = catalogos.filter((c) => c.setor === consultor.setor && c.status === "publicado");
  const meusEnvios = envios.filter((e) => e.consultorId === consultor.id);

  return (
    <div>
      <TopNav tabs={tabs} current={tab} onNav={setTab} roleLabel={`Consultor · ${SETORES[consultor.setor]}`} onLogout={onLogout} />

      {tab === "painel" && (
        <>
          <Hero title={`Olá, ${consultor.nome.split(" ")[0]}`} stats={[
            { label: "Catálogos", value: meusCatalogos.length },
            { label: "Clientes", value: meusEnvios.length },
            { label: "Pedidos", value: meusEnvios.filter((e) => e.pedidoEm).length, color: "text-emerald-400" },
          ]} />
          <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">
            {meusCatalogos.length === 0 && <p className="text-stone-400 text-sm">Nenhum catálogo publicado pro seu setor ainda.</p>}
            {meusCatalogos.map((cat) => (
              <CatalogoConsultorCard key={cat.id} catalogo={cat} consultor={consultor}
                envios={meusEnvios.filter((e) => e.catalogoId === cat.id)}
                onCriarEnvio={onCriarEnvio} onSimular={() => onSimular(cat.id)} onAbrirEnvio={(envioId) => onAbrirEnvio(cat.id, envioId)} />
            ))}
          </div>
        </>
      )}

      {tab === "desempenho" && (
        <RastreamentoView consultores={[consultor]} catalogos={catalogos} envios={envios} escopo="proprio" apenasConsultorId={consultor.id}
          onSincronizar={onSincronizar} sincronizando={sincronizando} />
      )}
    </div>
  );
}

function CatalogoConsultorCard({ catalogo, consultor, envios, onCriarEnvio, onSimular, onAbrirEnvio }) {
  const [novo, setNovo] = useState(false);
  const [nomeCliente, setNomeCliente] = useState("");
  const [telCliente, setTelCliente] = useState("");
  const [copiado, setCopiado] = useState(null);
  const [periodo, setPeriodo] = useState("todos");
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");

  const { de, ate } = useMemo(() => calcularIntervaloPeriodo(periodo, dataInicio, dataFim), [periodo, dataInicio, dataFim]);
  const enviosFiltrados = envios.filter((env) => {
    if (de !== null && env.criadoEm < de) return false;
    if (ate !== null && env.criadoEm >= ate) return false;
    return true;
  });

  function registrar(e) {
    e.preventDefault();
    if (!nomeCliente.trim()) return;
    onCriarEnvio(catalogo.id, consultor.id, nomeCliente.trim(), telCliente.trim());
    setNomeCliente(""); setTelCliente(""); setNovo(false);
  }

  function statusDe(env) {
    if (env.pedidoEm) return { label: "Pediu", cls: "bg-emerald-100 text-emerald-700" };
    if (env.carrinhoEm) return { label: "No carrinho", cls: "bg-amber-100 text-amber-700" };
    if (env.visualizadoEm) return { label: "Visualizou", cls: "bg-sky-100 text-sky-700" };
    return { label: "Aguardando", cls: "bg-stone-100 text-stone-500" };
  }

  const linkGeral = `${linkBase()}#/c/${catalogo.id}/${consultor.id}`;

  return (
    <div className="bg-white border border-stone-200 rounded-xl p-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <div className="font-bold text-sm">{catalogo.nome}</div>
          <div className="text-[11px] text-stone-400">{catalogo.itens.length} produtos · {SETORES[catalogo.setor]}</div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => { navigator.clipboard?.writeText(linkGeral); setCopiado("geral"); setTimeout(() => setCopiado(null), 1200); }}
            title="Um link só pra mandar pra vários clientes — cada abertura vira um registro novo no Rastreamento"
            className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wide border border-stone-300 rounded-md px-2.5 py-1.5 hover:bg-stone-50">
            {copiado === "geral" ? <Check size={13} /> : <Copy size={13} />} {copiado === "geral" ? "Copiado" : "Link geral"}
          </button>
          <button onClick={onSimular} className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wide border border-stone-300 rounded-md px-2.5 py-1.5 hover:bg-stone-50">
            <Eye size={13} /> Pré-visualizar
          </button>
          <button onClick={() => setNovo(!novo)} className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wide bg-lime-400 text-neutral-950 rounded-md px-2.5 py-1.5 hover:bg-lime-300">
            <UserPlus size={13} /> Registrar envio
          </button>
        </div>
      </div>

      {novo && (
        <form onSubmit={registrar} className="mt-3 pt-3 border-t border-stone-100 flex flex-wrap gap-2 items-center">
          <input required placeholder="Nome do cliente" value={nomeCliente} onChange={(e) => setNomeCliente(e.target.value)}
            className="border border-stone-300 rounded-lg px-3 py-1.5 text-sm flex-1 min-w-[160px]" />
          <input placeholder="Telefone (opcional)" value={telCliente} onChange={(e) => setTelCliente(e.target.value)}
            className="border border-stone-300 rounded-lg px-3 py-1.5 text-sm w-44" />
          <button type="submit" className="bg-neutral-950 text-white text-xs font-bold uppercase tracking-wide px-3 py-1.5 rounded-md">Gerar link</button>
        </form>
      )}

      {envios.length > 0 && (
        <div className="mt-3 pt-3 border-t border-stone-100">
          <div className="flex flex-wrap items-end gap-2 mb-2">
            <div className="flex items-center gap-1 text-stone-400 text-[10px] font-bold uppercase tracking-wide pr-0.5"><Filter size={11} /> Período</div>
            <select value={periodo} onChange={(e) => setPeriodo(e.target.value)} className="border border-stone-300 rounded-lg px-2 py-1 text-[11px]">
              {PERIODO_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
            {periodo === "personalizado" && (
              <>
                <input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} className="border border-stone-300 rounded-lg px-2 py-1 text-[11px]" />
                <input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} className="border border-stone-300 rounded-lg px-2 py-1 text-[11px]" />
              </>
            )}
            <span className="text-[11px] text-stone-400">{enviosFiltrados.length} de {envios.length}</span>
          </div>
          <div className="space-y-1.5">
            {enviosFiltrados.length === 0 && <p className="text-[11px] text-stone-400 px-1">Nenhum link nesse período.</p>}
            {enviosFiltrados.map((env) => {
              const s = statusDe(env);
              const link = `${linkBase()}#/c/${catalogo.id}/${consultor.id}/${env.id}`;
              return (
                <div key={env.id} className="flex items-center justify-between gap-2 bg-stone-50 rounded-lg px-3 py-2 text-xs">
                  <span className="font-medium w-32 truncate">{env.clienteNome}</span>
                  <span className="text-stone-400 text-[10px] w-14 shrink-0">{new Date(env.criadoEm).toLocaleDateString("pt-BR")}</span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${s.cls}`}>{s.label}</span>
                  <span className="font-mono text-stone-400 truncate flex-1">{link}</span>
                  <button onClick={() => { navigator.clipboard?.writeText(link); setCopiado(env.id); setTimeout(() => setCopiado(null), 1200); }}
                    className="inline-flex items-center gap-1 text-stone-500 hover:text-stone-900 shrink-0">
                    {copiado === env.id ? <Check size={12} /> : <Copy size={12} />}
                  </button>
                  <button onClick={() => onAbrirEnvio(env.id)} className="inline-flex items-center gap-1 text-lime-700 hover:text-lime-900 font-semibold shrink-0">
                    <Eye size={12} /> Ver
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Catálogo público (cliente) — vitrine escura, estilo loja online
// ---------------------------------------------------------------------------
// Gradiente de cada seção curada é fixo (ligado à chave do badge); título/descrição/
// ativo/ordem vêm da API (editáveis pelo gerente em Painel > Seções).
const SECOES_GRAD = {
  marca_exclusiva: "from-amber-900 via-orange-800 to-neutral-900",
  lancamento: "from-sky-900 via-blue-800 to-neutral-900",
  oferta: "from-violet-900 via-purple-800 to-neutral-900",
  mais_vendido: "from-yellow-800 via-amber-700 to-neutral-900",
};

// Arrastar-pra-rolar nos carrosséis horizontais: overflow-x-auto sozinho não deixa
// arrastar com o cursor no mouse, e o toque no touch-action padrão fica ambíguo com o
// scroll vertical da página. Pointer Events unificam mouse/touch/caneta num só handler;
// touch-action: pan-y deixa o scroll vertical nativo intacto e só a gente cuida do horizontal.
function useDragScroll() {
  const ref = useRef(null);
  const estado = useRef({ arrastando: false, x: 0, scrollInicial: 0, moveu: false, pointerId: null });

  function onPointerDown(e) {
    const el = ref.current;
    if (!el) return;
    // Não captura o ponteiro aqui: um clique simples (sem arrastar) precisa continuar
    // chegando normal no botão do produto. Só captura se virar arrasto de verdade (ver onPointerMove).
    estado.current = { arrastando: true, x: e.clientX, scrollInicial: el.scrollLeft, moveu: false, pointerId: e.pointerId };
  }
  function onPointerMove(e) {
    const el = ref.current;
    if (!el || !estado.current.arrastando) return;
    const delta = e.clientX - estado.current.x;
    if (Math.abs(delta) > 5 && !estado.current.moveu) {
      estado.current.moveu = true;
      el.setPointerCapture?.(e.pointerId);
      el.style.cursor = "grabbing";
    }
    if (estado.current.moveu) el.scrollLeft = estado.current.scrollInicial - delta;
  }
  function soltar() {
    const el = ref.current;
    if (el && estado.current.pointerId != null && el.hasPointerCapture?.(estado.current.pointerId)) {
      el.releasePointerCapture(estado.current.pointerId);
    }
    estado.current.arrastando = false;
    if (el) el.style.cursor = "grab";
  }
  // Sem isso, soltar o arrasto em cima de um card dispararia o clique dele (abriria o modal).
  function onClickCapture(e) {
    if (estado.current.moveu) { e.preventDefault(); e.stopPropagation(); }
  }

  return { ref, onPointerDown, onPointerMove, onPointerUp: soltar, onPointerLeave: soltar, onPointerCancel: soltar, onClickCapture };
}

function CarrosselProdutos({ itens, qtdPorProduto, onAbrirItem, accent }) {
  const drag = useDragScroll();
  return (
    <div ref={drag.ref} onPointerDown={drag.onPointerDown} onPointerMove={drag.onPointerMove}
      onPointerUp={drag.onPointerUp} onPointerLeave={drag.onPointerLeave} onPointerCancel={drag.onPointerCancel}
      onClickCapture={drag.onClickCapture}
      className="flex gap-4 overflow-x-auto pb-2 cursor-grab select-none" style={{ touchAction: "pan-y" }}>
      {itens.map((it) => <ProdutoCard key={it.produtoId} item={it} qtd={qtdPorProduto(it.produtoId)} onAbrir={() => onAbrirItem(it)} largura="w-52 shrink-0" accent={accent} />)}
    </div>
  );
}

// Estado "sem resultado" da busca: em vez de só avisar que não achou, oferece um jeito
// de perguntar pro consultor (WhatsApp já preenchido) e sugere produtos parecidos, pra não
// perder a venda por causa de um produto que não está nesse catálogo específico.
function SemResultados({ busca, categoriaFiltro, itensValidos, consultor, catalogo, qtdPorProduto, onAbrir, accent, onBuscaSemResultado }) {
  const termo = busca.trim();

  useEffect(() => {
    if (!onBuscaSemResultado || termo.length < 2) return;
    const handle = setTimeout(() => onBuscaSemResultado(termo), 800);
    return () => clearTimeout(handle);
  }, [termo]);

  const sugestoes = useMemo(() => {
    if (categoriaFiltro !== "todas") {
      return itensValidos.filter((it) => (it.produto.categoria || "Outros") === categoriaFiltro).slice(0, 4);
    }
    const maisVendidos = itensValidos.filter((it) => (it.produto.badges || []).includes("mais_vendido"));
    return (maisVendidos.length > 0 ? maisVendidos : itensValidos).slice(0, 4);
  }, [itensValidos, categoriaFiltro]);

  const mensagem = `Olá! Procurei${termo ? ` "${termo}"` : ""} no catálogo "${catalogo.nome}" e não encontrei. Vocês têm?`;
  const linkWhats = `https://wa.me/${toWaNumber(consultor.whatsapp)}?text=${encodeURIComponent(mensagem)}`;

  return (
    <div className="py-10 text-center">
      <p className="text-stone-400 text-sm">
        {termo ? <>Não encontramos <span className="text-white font-semibold">"{termo}"</span> neste catálogo.</> : "Nenhum produto encontrado com esse filtro."}
      </p>
      <a href={linkWhats} target="_blank" rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 mt-4 text-white font-bold text-sm rounded-lg px-4 py-2.5" style={{ backgroundColor: accent }}>
        <MessageCircle size={15} /> Perguntar pro consultor no WhatsApp
      </a>

      {sugestoes.length > 0 && (
        <div className="mt-10 text-left">
          <h3 className="text-stone-400 text-xs font-bold uppercase tracking-wide mb-3">Talvez você goste destes</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {sugestoes.map((it) => <ProdutoCard key={it.produtoId} item={it} qtd={qtdPorProduto(it.produtoId)} onAbrir={() => onAbrir(it)} accent={accent} />)}
          </div>
        </div>
      )}
    </div>
  );
}

function CatalogoPublico({ catalogo, consultor, produtos, secoes, simulate, onPrimeiraVisualizacao, onAdicionouCarrinho, onPedido, onBuscaSemResultado, onSair }) {
  const [carrinho, setCarrinho] = useState({});
  const [showCart, setShowCart] = useState(false);
  const [busca, setBusca] = useState("");
  const [categoriaFiltro, setCategoriaFiltro] = useState("todas");
  const [modalItem, setModalItem] = useState(null);
  const registrouVisita = useRef(false);
  const registrouCarrinho = useRef(false);
  const gradeRef = useRef(null);

  useEffect(() => {
    if (!registrouVisita.current && catalogo && consultor) { registrouVisita.current = true; onPrimeiraVisualizacao(); }
  }, [catalogo, consultor]);

  if (!catalogo || !consultor) {
    return (
      <div className="min-h-[500px] bg-neutral-950 flex flex-col items-center justify-center text-center px-6">
        <p className="text-stone-400 text-sm mb-3">Este link não é mais válido ou o catálogo foi removido.</p>
        {onSair && <button onClick={onSair} className="text-sm text-white underline">Voltar</button>}
      </div>
    );
  }

  const produtosMap = Object.fromEntries(produtos.map((p) => [p.id, p]));
  const itensValidos = catalogo.itens.filter((it) => produtosMap[it.produtoId]).map((it) => ({ ...it, produto: produtosMap[it.produtoId] }));
  const categoriasPresentes = [...new Set(itensValidos.map((it) => it.produto.categoria || "Outros"))];
  const accent = catalogo.corDestaque || CATALOGO_COR_PADRAO;

  const itensFiltrados = itensValidos.filter((it) => {
    if (categoriaFiltro !== "todas" && (it.produto.categoria || "Outros") !== categoriaFiltro) return false;
    if (busca.trim() && !it.produto.nome.toLowerCase().includes(busca.trim().toLowerCase())) return false;
    return true;
  });

  const porBadge = (chave) => itensFiltrados.filter((it) => (it.produto.badges || []).includes(chave));
  // Dentro de cada seção curada, agrupa por marca — sem isso, seções com produtos de
  // marcas diferentes (ex: "Marcas Exclusivas") viravam uma lista única sem separação.
  const agruparPorMarca = (itens) => {
    const grupos = {};
    itens.forEach((it) => { const marca = it.produto.marca || "Outras marcas"; (grupos[marca] = grupos[marca] || []).push(it); });
    return Object.entries(grupos)
      .sort(([a], [b]) => (a === "Outras marcas" ? 1 : b === "Outras marcas" ? -1 : a.localeCompare(b)))
      .map(([marca, itens]) => ({ marca, itens }));
  };
  const secoesCuradas = (secoes || [])
    .filter((s) => s.setor === catalogo.setor && s.ativo)
    .sort((a, b) => a.ordem - b.ordem)
    .map((s) => ({ chave: s.chave, titulo: s.titulo, desc: s.descricao, grad: SECOES_GRAD[s.chave] || "from-stone-800 via-stone-700 to-neutral-900", itens: porBadge(s.chave) }))
    .filter((s) => s.itens.length > 0)
    .map((s) => ({ ...s, grupos: agruparPorMarca(s.itens) }));

  // Carrinho: { [produtoId]: { [sabor || SEM_SABOR]: quantidade } } — permite pedir
  // vários sabores do mesmo produto, cada combinação produto+sabor vira uma linha.
  const qtdTotal = Object.values(carrinho).reduce((s, porSabor) => s + Object.values(porSabor).reduce((s2, q) => s2 + q, 0), 0);
  const qtdPorProduto = (produtoId) => Object.values(carrinho[produtoId] || {}).reduce((s, q) => s + q, 0);
  const carrinhoItens = Object.entries(carrinho).flatMap(([produtoId, porSabor]) => {
    const item = itensValidos.find((it) => it.produtoId === produtoId);
    if (!item) return [];
    return Object.entries(porSabor).filter(([, q]) => q > 0).map(([saborKey, quantidade]) => ({
      produtoId, sabor: saborKey === SEM_SABOR ? null : saborKey, quantidade,
      // Carrinho/pedido usam o "Por" (não o à vista) — é o único preço que o cliente vê na tela agora.
      precoVista: item.precoParcelado, nome: produtosMap[produtoId].nome,
      emoji: produtosMap[produtoId].emoji, temImagem: produtosMap[produtoId].temImagem,
      marca: produtosMap[produtoId].marca || "Outras marcas",
    }));
  });
  const total = carrinhoItens.reduce((s, it) => s + it.precoVista * it.quantidade, 0);
  // Agrupa por marca — com muitos itens de marcas diferentes, o consultor precisa
  // conseguir separar o pedido rapidinho pra conferir/organizar a entrega.
  const carrinhoPorMarca = useMemo(() => {
    const grupos = {};
    carrinhoItens.forEach((it) => { (grupos[it.marca] = grupos[it.marca] || []).push(it); });
    return Object.entries(grupos)
      .sort(([a], [b]) => (a === "Outras marcas" ? 1 : b === "Outras marcas" ? -1 : a.localeCompare(b)))
      .map(([marca, itens]) => ({ marca, itens, subtotal: itens.reduce((s, it) => s + it.precoVista * it.quantidade, 0) }));
  }, [carrinhoItens]);

  function alterarQtd(produtoId, sabor, delta) {
    const saborKey = sabor || SEM_SABOR;
    setCarrinho((c) => {
      const atual = c[produtoId]?.[saborKey] || 0;
      const novo = Math.max(0, atual + delta);
      return { ...c, [produtoId]: { ...c[produtoId], [saborKey]: novo } };
    });
    if (delta > 0 && !registrouCarrinho.current) { registrouCarrinho.current = true; onAdicionouCarrinho(); }
  }
  function removerDoCarrinho(produtoId, saborKey) {
    setCarrinho((c) => ({ ...c, [produtoId]: { ...c[produtoId], [saborKey]: 0 } }));
  }

  function enviarPedido() {
    if (carrinhoItens.length === 0) return;
    const blocos = carrinhoPorMarca.map(({ marca, itens, subtotal }) => {
      const linhas = itens.map((it) => {
        const nomeExibido = it.sabor ? `${it.nome} (${it.sabor})` : it.nome;
        return `• ${nomeExibido} — Qtd: ${it.quantidade} — ${formatBRL(it.precoVista)} un. — Subtotal: ${formatBRL(it.precoVista * it.quantidade)}`;
      }).join("\n");
      return `*${marca}*\n${linhas}\nSubtotal ${marca}: ${formatBRL(subtotal)}`;
    }).join("\n\n");
    const mensagem = `Olá! Gostaria de fazer o seguinte pedido pelo catálogo "${catalogo.nome}":\n\n${blocos}\n\n*Total: ${formatBRL(total)}*`;
    const url = `https://wa.me/${toWaNumber(consultor.whatsapp)}?text=${encodeURIComponent(mensagem)}`;
    onPedido({ itens: carrinhoItens, total });
    window.open(url, "_blank");
  }

  return (
    <div className="min-h-[600px] bg-neutral-950 text-white pb-24">
      {onSair && (
        <div className="bg-amber-100 text-amber-800 text-xs text-center py-1.5 px-4">
          {simulate ? "Modo simulação — cliques aqui não são contabilizados." : "Pré-visualização do envio registrado."}{" "}
          <button onClick={onSair} className="underline font-semibold ml-1">Voltar</button>
        </div>
      )}

      {/* Navbar */}
      <div className="border-b border-white/10 px-6 py-3 flex items-center justify-between">
        <div className="font-black tracking-tight">HP <span className="text-orange-500">DISTRIBUIDORA</span></div>
        <span className="text-[11px] font-bold uppercase tracking-wide rounded-full px-3 py-1 border" style={{ color: accent, borderColor: hexToRgba(accent, 0.3), backgroundColor: hexToRgba(accent, 0.15) }}>
          Catálogo {SETORES[catalogo.setor]}
        </span>
      </div>

      {/* Hero */}
      <div className="px-6 pt-10 pb-8 max-w-6xl mx-auto grid lg:grid-cols-2 gap-8 items-center">
        <div>
          <span className="inline-block text-[11px] font-bold uppercase tracking-wide rounded-full px-3 py-1 mb-4 border" style={{ color: accent, borderColor: hexToRgba(accent, 0.3), backgroundColor: hexToRgba(accent, 0.15) }}>
            Catálogo {SETORES[catalogo.setor]}
          </span>
          <h1 className="font-black text-4xl sm:text-5xl leading-[1.05]">{catalogo.nome}</h1>
          <p className="font-semibold text-sm mt-3" style={{ color: accent }}>{catalogo.subtitulo || "Escolha seus suplementos e envie seu pedido"}</p>
          <p className="text-stone-400 text-sm mt-1">{itensValidos.length} produtos selecionados especialmente pra você.</p>
          <button onClick={() => gradeRef.current?.scrollIntoView({ behavior: "smooth" })}
            className="mt-5 transition text-white font-bold text-sm rounded-lg px-5 py-3" style={{ backgroundColor: accent }}>
            Ver produtos
          </button>
          <p className="text-stone-500 text-xs mt-3">Atendido por <span className="text-stone-300 font-semibold">{consultor.nome}</span> — o pedido vai direto pro WhatsApp dele.</p>
        </div>
        <div className="hidden lg:flex rounded-2xl aspect-[4/3] items-center justify-center bg-white/[0.02] overflow-hidden" style={!catalogoCapaSrc(catalogo) ? { border: `2px dashed ${hexToRgba(accent, 0.4)}` } : undefined}>
          {catalogoCapaSrc(catalogo) ? (
            <img src={catalogoCapaSrc(catalogo)} alt={catalogo.nome} className="w-full h-full object-cover" />
          ) : (
            <div className="text-center">
              <div className="font-black text-xl" style={{ color: accent }}>{catalogo.nome}</div>
              <div className="text-stone-500 text-xs mt-1">HP Distribuidora</div>
            </div>
          )}
        </div>
      </div>

      {/* Busca + filtros */}
      <div ref={gradeRef} className="sticky top-0 z-30 bg-neutral-950/95 backdrop-blur border-y border-white/10 px-6 py-3 scroll-mt-0">
        <div className="max-w-6xl mx-auto space-y-2.5">
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-500" />
              <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar produto..."
                className="w-full bg-white/5 border border-white/10 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-stone-500 focus:outline-none focus:border-orange-500/50" />
            </div>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1">
            <button onClick={() => setCategoriaFiltro("todas")}
              className={`shrink-0 text-xs font-bold uppercase tracking-wide px-3 py-1.5 rounded-full border ${categoriaFiltro === "todas" ? "bg-white text-neutral-950 border-white" : "border-white/15 text-stone-300"}`}>
              Todas
            </button>
            {categoriasPresentes.map((cat) => (
              <button key={cat} onClick={() => setCategoriaFiltro(cat)}
                className={`shrink-0 inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full border ${categoriaFiltro === cat ? "bg-white text-neutral-950 border-white" : "border-white/15 text-stone-300"}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${CATEGORIA_DOT[cat] || "bg-stone-400"}`} /> {cat}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8 space-y-10">
        {/* Seções curadas */}
        {secoesCuradas.map((s) => (
          <div key={s.chave}>
            <div className={`bg-gradient-to-r ${s.grad} rounded-2xl px-5 py-4 mb-4`}>
              <span className="text-[10px] font-bold uppercase tracking-widest text-white/60">Catálogo {SETORES[catalogo.setor]}</span>
              <h2 className="font-black text-2xl mt-0.5">{s.titulo}</h2>
              <p className="text-white/60 text-xs mt-1">{s.desc}</p>
            </div>
            <div className="space-y-5">
              {s.grupos.map(({ marca, itens }) => (
                <div key={marca}>
                  <div className="flex items-center gap-2.5 mb-2.5">
                    <span className="text-[11px] font-bold uppercase tracking-wide text-stone-400">{marca}</span>
                    <span className="flex-1 h-px bg-white/10" />
                  </div>
                  <CarrosselProdutos itens={itens} qtdPorProduto={qtdPorProduto} onAbrirItem={setModalItem} accent={accent} />
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* Todos os produtos */}
        <div>
          <h2 className="font-black text-xl mb-4">Todos os produtos</h2>
          {itensFiltrados.length === 0 ? (
            <SemResultados busca={busca} categoriaFiltro={categoriaFiltro} itensValidos={itensValidos}
              consultor={consultor} catalogo={catalogo} qtdPorProduto={qtdPorProduto} onAbrir={setModalItem}
              accent={accent} onBuscaSemResultado={onBuscaSemResultado} />
          ) : (
            <div className="space-y-8">
              {agruparPorMarca(itensFiltrados).map(({ marca, itens }) => (
                <div key={marca}>
                  <div className="flex items-center gap-2.5 mb-3">
                    <span className="text-[11px] font-bold uppercase tracking-wide text-stone-400">{marca}</span>
                    <span className="flex-1 h-px bg-white/10" />
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                    {itens.map((it) => <ProdutoCard key={it.produtoId} item={it} qtd={qtdPorProduto(it.produtoId)} onAbrir={() => setModalItem(it)} accent={accent} />)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-white/10 px-6 py-6 text-center">
        <p className="text-sm font-bold">HP Distribuidora <span className="text-stone-500 font-normal">· Suplementos pra você vender mais.</span></p>
        <p className="text-stone-500 text-xs mt-1">Preços e condições conforme este catálogo. Em caso de dúvida, fale com {consultor.nome}.</p>
      </div>

      {/* Modal de detalhes / adicionar */}
      {modalItem && (
        <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 px-0 sm:px-4">
          <div className="bg-neutral-900 border border-white/10 w-full sm:max-w-sm sm:rounded-2xl rounded-t-2xl overflow-hidden max-h-[92vh] sm:max-h-[85vh] flex flex-col">
            <div className="h-40 sm:h-48 shrink-0 bg-gradient-to-br from-white/10 to-transparent border-b border-dashed flex items-center justify-center relative overflow-hidden" style={{ borderColor: hexToRgba(accent, 0.3) }}>
              {produtoImgSrc(modalItem.produto) ? (
                <img src={produtoImgSrc(modalItem.produto)} alt={modalItem.produto.nome} className="w-full h-full object-contain p-4" />
              ) : (
                <span className="text-6xl">{modalItem.produto.emoji}</span>
              )}
              <button onClick={() => setModalItem(null)} className="absolute top-3 right-3 bg-black/40 rounded-full p-1.5"><X size={16} /></button>
            </div>
            <div className="p-5 overflow-y-auto flex-1 min-h-0">
              {modalItem.produto.marca && <div className="text-orange-400 text-[11px] font-bold uppercase tracking-wide">{modalItem.produto.marca}</div>}
              <h3 className="font-black text-lg mt-0.5">{modalItem.produto.nome}</h3>
              <div className="text-stone-400 text-xs mt-0.5">{modalItem.produto.gramatura}</div>
              {modalItem.produto.descricao && <p className="text-stone-300 text-sm mt-2.5">{modalItem.produto.descricao}</p>}

              {modalItem.produto.notaPromo && <p className="text-amber-400 text-xs mt-2">✦ {modalItem.produto.notaPromo}</p>}

              <div className="mt-4">
                {modalItem.precoDe > modalItem.precoParcelado && (
                  <div className="text-stone-500 text-xs line-through">De {formatBRL(modalItem.precoDe)}</div>
                )}
                <div className="font-black text-xl">Por {formatBRL(modalItem.precoParcelado)}</div>
              </div>

              {(modalItem.produto.sabores?.length || 0) >= 2 ? (
                <div className="mt-5">
                  <div className="text-stone-400 text-xs mb-2">
                    Este produto tem preço único. Veja o valor de cada sabor abaixo.
                  </div>
                  <div className="space-y-1.5">
                    {modalItem.produto.sabores.map((sabor) => {
                      const qtdSabor = carrinho[modalItem.produtoId]?.[sabor] || 0;
                      return (
                        <div key={sabor} className="flex items-center justify-between bg-white/5 rounded-xl px-3 py-2">
                          <div>
                            <div className="text-sm font-semibold">{sabor}</div>
                            <div className="text-stone-400 text-[11px]">Por {formatBRL(modalItem.precoParcelado)}</div>
                          </div>
                          <div className="flex items-center gap-2.5 shrink-0">
                            <button onClick={() => alterarQtd(modalItem.produtoId, sabor, -1)} disabled={qtdSabor === 0}
                              className="w-7 h-7 flex items-center justify-center rounded-full bg-white/10 disabled:opacity-30"><Minus size={13} /></button>
                            <span className="font-mono font-bold text-sm w-4 text-center">{qtdSabor}</span>
                            <button onClick={() => alterarQtd(modalItem.produtoId, sabor, 1)} className="w-7 h-7 flex items-center justify-center rounded-full" style={{ backgroundColor: accent }}><Plus size={13} /></button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between mt-5 bg-white/5 rounded-full p-1.5">
                  <button onClick={() => alterarQtd(modalItem.produtoId, modalItem.produto.sabores?.[0], -1)} disabled={qtdPorProduto(modalItem.produtoId) === 0}
                    className="w-9 h-9 flex items-center justify-center rounded-full bg-white/10 disabled:opacity-30"><Minus size={15} /></button>
                  <span className="font-mono font-bold text-lg">{qtdPorProduto(modalItem.produtoId)}</span>
                  <button onClick={() => alterarQtd(modalItem.produtoId, modalItem.produto.sabores?.[0], 1)} className="w-9 h-9 flex items-center justify-center rounded-full" style={{ backgroundColor: accent }}><Plus size={15} /></button>
                </div>
              )}
            </div>
            <div className="p-5 pt-3 border-t border-white/10 shrink-0">
              <button onClick={() => setModalItem(null)} className="w-full bg-white text-neutral-950 font-bold text-sm rounded-lg py-2.5">
                {qtdPorProduto(modalItem.produtoId) > 0 ? "Adicionado ao pedido" : "Fechar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Botão flutuante do carrinho */}
      {qtdTotal > 0 && !modalItem && (
        <button onClick={() => setShowCart(true)} style={{ backgroundColor: accent }}
          className="fixed bottom-5 right-5 z-40 hover:brightness-110 transition text-white font-bold text-sm rounded-full pl-4 pr-5 py-3 flex items-center gap-2 shadow-2xl">
          <ShoppingCart size={17} /> Meu pedido <span className="bg-white/25 rounded-full text-xs w-5 h-5 flex items-center justify-center">{qtdTotal}</span>
        </button>
      )}

      {/* Carrinho */}
      {showCart && (
        <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50">
          <div className="bg-neutral-900 border border-white/10 w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
              <h3 className="font-black text-sm uppercase tracking-wide">Seu pedido</h3>
              <button onClick={() => setShowCart(false)}><X size={18} className="text-stone-400" /></button>
            </div>
            <div className="flex-1 overflow-auto px-5 py-3 space-y-4">
              {carrinhoPorMarca.map(({ marca, itens, subtotal }) => (
                <div key={marca}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px] font-bold uppercase tracking-wide text-orange-400">{marca}</span>
                    <span className="text-[11px] text-stone-500 font-mono">{formatBRL(subtotal)}</span>
                  </div>
                  <div className="space-y-1">
                    {itens.map((it) => (
                      <div key={`${it.produtoId}::${it.sabor || ""}`} className="flex items-center gap-3 py-2 border-b border-white/5 last:border-0">
                        <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center text-xl shrink-0 overflow-hidden">
                          {it.temImagem ? <img src={api.produtos.imagemUrl(it.produtoId)} alt={it.nome} loading="lazy" className="w-full h-full object-contain" /> : it.emoji}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-sm truncate">{it.nome}{it.sabor && <span className="text-stone-400 font-normal"> ({it.sabor})</span>}</div>
                          <div className="text-xs text-stone-500">Qtd: {it.quantidade} × {formatBRL(it.precoVista)}</div>
                        </div>
                        <span className="font-mono text-sm font-bold shrink-0">{formatBRL(it.precoVista * it.quantidade)}</span>
                        <button onClick={() => removerDoCarrinho(it.produtoId, it.sabor || SEM_SABOR)} className="text-stone-600 hover:text-red-400 shrink-0"><Trash2 size={14} /></button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="px-5 py-4 border-t border-white/10">
              <div className="flex justify-between text-base font-black mb-3"><span>Total</span><span className="font-mono">{formatBRL(total)}</span></div>
              {simulate && (
                <p className="text-[11px] text-amber-500 text-center mb-2 font-semibold">⚠ Modo simulação: este pedido não será contabilizado no Rastreamento.</p>
              )}
              <button onClick={enviarPedido} style={{ backgroundColor: accent }}
                className="w-full hover:brightness-110 transition text-white rounded-xl py-3.5 text-sm font-bold flex items-center justify-center gap-2">
                <Send size={16} /> Fazer pedido via WhatsApp
              </button>
              <p className="text-[11px] text-stone-500 text-center mt-2.5">Enviado direto pro WhatsApp de {consultor.nome.split(" ")[0]} pra confirmar com você.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ProdutoCard({ item, qtd, onAbrir, largura, accent }) {
  const p = item.produto;
  const temDe = item.precoDe > item.precoParcelado;
  const cor = accent || CATALOGO_COR_PADRAO;
  return (
    <button onClick={onAbrir} className={`text-left bg-neutral-900 border rounded-xl overflow-hidden transition ${largura || ""}`} style={{ borderColor: "rgba(255,255,255,0.1)" }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = hexToRgba(cor, 0.5); }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"; }}>
      <div className="aspect-square m-2.5 rounded-lg border-2 border-dashed bg-white/[0.02] flex items-center justify-center relative overflow-hidden" style={{ width: "calc(100% - 20px)", borderColor: hexToRgba(cor, 0.3) }}>
        {produtoImgSrc(p) ? <img src={produtoImgSrc(p)} alt={p.nome} draggable={false} loading="lazy" className="w-full h-full object-contain p-3" /> : <span className="text-5xl">{p.emoji}</span>}
        {qtd > 0 && <span className="absolute top-1.5 right-1.5 text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center" style={{ backgroundColor: cor }}>{qtd}</span>}
      </div>
      <div className="px-3 pb-3">
        {p.marca && <div className="text-orange-400 text-[10px] font-bold uppercase tracking-wide">{p.marca}</div>}
        <div className="font-bold text-sm leading-tight mt-0.5">{p.nome}</div>
        <div className="text-stone-500 text-[11px] mt-0.5">{p.gramatura}</div>
        <div className="flex items-center gap-1 text-[11px] text-stone-400 mt-1">
          <span className={`w-1.5 h-1.5 rounded-full ${CATEGORIA_DOT[p.categoria] || "bg-stone-400"}`} /> {p.categoria}
        </div>

        {p.notaPromo && <p className="text-amber-400 text-[10px] mt-1.5">✦ {p.notaPromo}</p>}
        {(p.sabores?.length || 0) >= 2 && (
          <p className="text-stone-400 text-[10px] mt-1.5">{p.sabores.length} sabores disponíveis</p>
        )}

        <div className="mt-2.5">
          {temDe && <div className="text-stone-500 text-[10px] line-through">De {formatBRL(item.precoDe)}</div>}
          <div className="font-black text-sm">Por {formatBRL(item.precoParcelado)}</div>
        </div>

        <div className="mt-2.5 w-full border border-white/15 text-stone-300 text-[11px] font-bold uppercase tracking-wide rounded-lg py-1.5 text-center">
          Ver detalhes
        </div>
      </div>
    </button>
  );
}