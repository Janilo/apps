// RiskJud — modelo de risco LGPD (client-side, determinístico).
// v2: ANPD calibrada à realidade, probabilidades como input, camadas de custo
// separadas (judicial / ANPD / total-incidente IBM), esperado vs pior-caso.

// P(vazamento/ano) por porte — JUÍZO editorial, NÃO calibrado contra dado (diferente da
// indenização, que vem da jurisprudência). É a premissa que mais move a magnitude; ajustável.
const PORTE_BREACH_BASE = { mei: 0.12, pequena: 0.20, media: 0.30, grande: 0.40 };
const DATA_TYPE_BREACH_MULT = { financeiro: 1.30, saude: 1.50, cartao: 1.40, pessoal: 1.00 };
const MATURITY_REDUCTION = { basico: 1.00, intermediario: 0.50, avancado: 0.15 };
// Fração dos usuários afetada num vazamento, por cenário (editável: pequeno/esperado/grande).
const BREACH_SCENARIOS = { pequeno: 0.01, esperado: 0.05, grande: 0.15 };

// Multiplicador de dano por setor. Só financeiro e varejo têm base amostral (SETOR_N);
// os demais usam 1,0 neutro (placeholder, sem base setorial). geral = base nacional.
const SETOR_DANO_MULT = { geral: 1, financeiro: 1.26, saude: 1, varejo: 1.55, tecnologia: 1, telecom: 1, seguradora: 1, educacao: 1 };
const SETOR_N = { financeiro: 42, varejo: 27 };

// Procedência por natureza do dano (doutrina STJ): dado sensível tende ao dano presumido
// (in re ipsa), dado comum exige prova do dano. Fator é JUÍZO sobre a taxa-base medida no
// agregado (0,6967), NÃO taxa medida por tipo de dado. Disclosed na UI.
const PROCEDENCIA_FATOR = { presumido: 1.12, misto: 1.0, comprovar: 0.85 };

// pSue agora é a FRAÇÃO dos afetados que efetivamente processa (taxa per-capita),
// NÃO uma probabilidade aplicada por cima de uma contagem de ações (isso double-contava
// e zerava o litígio). Dos milhões de pessoas expostas em vazamentos no Brasil, pouquíssimas
// litigam (~813 ações/ano no país inteiro). Dado sensível eleva a propensão. Juízo editável.
const P_SUE_PERCAPITA = { pessoal: 0.0003, financeiro: 0.0006, cartao: 0.0006, saude: 0.0010 };
const P_SUE_CAP = 0.05; // teto: no máximo 5% dos afetados processam
const PORTE_VALOR_MULTIPLIERS = { mei: 0.6, pequena: 0.8, media: 1.0, grande: 1.35 };

// ANPD (Art. 52 LGPD): teto 2% do faturamento Brasil, limite R$ 50M/infração.
const ANPD_MULTA_MAX = 50_000_000;
const ANPD_MULTA_PCT = 0.02;
// P(ANPD multar | vazamento) por maturidade — RECALIBRADA À REALIDADE.
// A ANPD aplicou pouquíssimas multas até 2025; a probabilidade real por vazamento
// é de fração de 1%, não dezenas de %. Default conservador e baixo; o usuário ajusta.
const ANPD_P_FINE = { basico: 0.02, intermediario: 0.01, avancado: 0.005 };
const ANPD_GRAVIDADE = { pessoal: 0.3, financeiro: 0.6, cartao: 0.5, saude: 0.8 };
const FATOR_RESPONSABILIDADE_SOLIDARIA = 1.2;

// IBM Cost of a Data Breach 2025 — custo TOTAL de incidente no Brasil (média de mercado,
// inclui resposta/forense/perda de negócio/remediação). Métrica DIFERENTE da indenização
// judicial; serve de referência, não se soma às camadas do modelo.
const IBM_CODB = { saude: 11_430_000, financeiro: 8_920_000, seguradora: 8_920_000, _default: 7_190_000 };

const r = (x, n = 2) => Math.round((x + Number.EPSILON) * 10 ** n) / 10 ** n;
const get = (o, k, d) => (o[k] !== undefined ? o[k] : d);
const isNum = (v) => typeof v === "number" && !Number.isNaN(v);

const DEFAULTS = {
  base_usuarios: 100000, dados_financeiros: false, dados_saude: false,
  dados_pessoais: false, dados_cartao: false, maturidade_seguranca: "basico",
  investimento_incremental: 0, horizonte_anos: 1, reincidencia: false,
  provas_concretas: false, porte_empresa: "media", setor: "geral",
  faturamento_brasil: 0,
  cenario_vazamento: "esperado",
  // overrides de probabilidade (null = usar o default calculado)
  p_breach_override: null, p_sue_override: null, p_multa_override: null,
};

function dataAttractiveness(q) {
  let m = 1.0;
  if (q.dados_saude) m = Math.max(m, DATA_TYPE_BREACH_MULT.saude);
  if (q.dados_cartao) m = Math.max(m, DATA_TYPE_BREACH_MULT.cartao);
  if (q.dados_financeiros) m = Math.max(m, DATA_TYPE_BREACH_MULT.financeiro);
  return m;
}

// --- probabilidades-base (defaults), antes de override e investimento ---
function pBreachBase(q) {
  const base = get(PORTE_BREACH_BASE, q.porte_empresa, 0.20);
  return Math.min(base * dataAttractiveness(q) * get(MATURITY_REDUCTION, q.maturidade_seguranca, 1.0), 0.90);
}

function pSueBase(q) {
  const tipos = [];
  if (q.dados_financeiros) tipos.push("financeiro");
  if (q.dados_saude) tipos.push("saude");
  if (q.dados_cartao) tipos.push("cartao");
  if (q.dados_pessoais) tipos.push("pessoal");
  if (!tipos.length) return 0;
  // porte e base de usuários entram via afetados e valor da causa, não aqui.
  let p = Math.max(...tipos.map((t) => P_SUE_PERCAPITA[t]));
  if (q.reincidencia) p *= 1.5;
  return Math.min(p, P_SUE_CAP);
}

function pMultaBase(q) {
  let p = get(ANPD_P_FINE, q.maturidade_seguranca, 0.01);
  if (q.reincidencia) p = Math.min(p * 1.5, 0.80);
  return p;
}

// Eficácia do investimento: curva CONTÍNUA e saturante (antes era degrau, e o ROI pulava
// nos limiares de R$/usuário). rp reduz P(vazamento), ri reduz o impacto. Mesmas âncoras do
// modelo antigo (perUser 1 → ~.15/.10, 3 → ~.32/.23, 10 → ~.54/.40), sem descontinuidade.
function investmentEffectiveness(investimento, baseUsuarios) {
  const perUser = baseUsuarios > 0 ? investimento / baseUsuarios : 0;
  if (perUser <= 0) return { rp: 0.0, ri: 0.0 };
  const rp = 0.75 * perUser / (perUser + 4);
  const ri = 0.60 * perUser / (perUser + 5);
  return { rp, ri };
}

function gravidadeMax(q) {
  const tipos = [];
  if (q.dados_saude) tipos.push("saude");
  if (q.dados_financeiros) tipos.push("financeiro");
  if (q.dados_cartao) tipos.push("cartao");
  if (q.dados_pessoais) tipos.push("pessoal");
  return tipos.length ? Math.max(...tipos.map((t) => get(ANPD_GRAVIDADE, t, 0.3))) : 0.3;
}

// Regime de dano (doutrina STJ) pela natureza do dado: sensível → presumido (in re ipsa),
// só dado comum → a comprovar. Move a procedência aplicada. Premissa, não taxa medida por tipo.
function regimeDano(q) {
  if (q.dados_saude || q.dados_cartao) return "presumido";
  if (q.dados_financeiros) return "misto";
  if (q.dados_pessoais) return "comprovar";
  return "misto";
}

// Núcleo: dada uma prob de vazamento (já com override/investimento), e as probs
// efetivas de processo e multa, devolve os componentes de custo.
function componentes(q, benchmark, pBreach, pSue, pMulta, impactoReduction) {
  // valor médio por processo (porte, reincidência, setor)
  let valor = get(benchmark, "valor_medio_causa", 15000.0);
  valor *= get(PORTE_VALOR_MULTIPLIERS, q.porte_empresa, 1.0);
  if (q.reincidencia) valor *= 1.2;
  valor *= get(SETOR_DANO_MULT, q.setor, 1.0);
  let taxa = get(benchmark, "taxa_procedencia", 0.65);
  const regime = regimeDano(q);
  taxa *= get(PROCEDENCIA_FATOR, regime, 1.0); // ajuste doutrinário pela natureza do dano
  if (q.provas_concretas) taxa *= 1.2;
  taxa = Math.min(taxa, 0.95);

  const fracBase = get(BREACH_SCENARIOS, q.cenario_vazamento, BREACH_SCENARIOS.esperado);
  let affected = Math.min(fracBase * dataAttractiveness(q), 0.5) * (1 - impactoReduction);
  const usuariosAfetados = Math.floor(q.base_usuarios * affected);
  // contagem de ações = fração que processa × afetados (uma propensão só, sem double-count)
  const processos = pSue * usuariosAfetados;
  const custoProcesso = valor * taxa;

  // litígio
  const litigioSeVazar = processos * custoProcesso * FATOR_RESPONSABILIDADE_SOLIDARIA;
  const litigioEsperado = pBreach * litigioSeVazar;

  // multa ANPD
  const anpdSeMultar = q.faturamento_brasil > 0
    ? Math.min(q.faturamento_brasil * ANPD_MULTA_PCT, ANPD_MULTA_MAX) * gravidadeMax(q)
    : 0;
  const anpdEsperado = pBreach * pMulta * anpdSeMultar;

  // IBM total de incidente: FAIXA de referência de mercado, não previsão.
  // Não se multiplica pela P(vazamento) deste modelo — seria emprestar precisão falsa.
  const ibmPorIncidente = get(IBM_CODB, q.setor, IBM_CODB._default);

  return {
    usuariosAfetados, processos,
    litigioSeVazar, litigioEsperado,
    anpdSeMultar, anpdEsperado,
    ibmPorIncidente,
    taxaEfetiva: taxa, regimeDano: regime,
  };
}

export function analisar(params, data) {
  const q = { ...DEFAULTS, ...params };
  const bench = data.benchmark;

  // probabilidades efetivas (override > default)
  const pBreach0 = isNum(q.p_breach_override) ? q.p_breach_override : pBreachBase(q);
  const pSue = isNum(q.p_sue_override) ? q.p_sue_override : pSueBase(q);
  const pMulta = isNum(q.p_multa_override) ? q.p_multa_override : pMultaBase(q);

  const sem = componentes(q, bench, pBreach0, pSue, pMulta, 0);
  const totalEsperado = sem.litigioEsperado + sem.anpdEsperado;
  const piorCaso = sem.litigioSeVazar + sem.anpdSeMultar; // se vazar E a ANPD multar

  // investimento: reduz p_breach e o impacto
  let investimento = null;
  if (q.investimento_incremental > 0) {
    const ef = investmentEffectiveness(q.investimento_incremental, q.base_usuarios);
    const pBreachCom = pBreach0 * (1 - ef.rp);
    const comp_com = componentes(q, bench, pBreachCom, pSue, pMulta, ef.ri);
    const totalCom = comp_com.litigioEsperado + comp_com.anpdEsperado;
    const economia = (totalEsperado - totalCom) * q.horizonte_anos;
    const inv = q.investimento_incremental;
    let roi = 0, payback = null;
    if (inv > 0 && economia > 0) { roi = (economia - inv) / inv; payback = inv / (economia / q.horizonte_anos); }
    let rec, conf;
    if (roi > 3) { rec = "Investimento altamente recomendado pelo risco jurídico/administrativo modelado."; conf = "Alta"; }
    else if (roi > 1) { rec = "Investimento recomendado: retorno supera o custo em mais de 2x."; conf = "Alta"; }
    else if (roi > 0) { rec = "Retorno positivo, mas moderado. Pese fatores fora deste modelo."; conf = "Média"; }
    else if (economia > 0) { rec = "Reduz exposição, mas o ROI pelo risco jurídico é baixo. O caso de investir costuma estar no custo total de incidente, não nas indenizações."; conf = "Média"; }
    else { rec = "Não se justifica pelo risco jurídico/administrativo isolado. Avalie pelo custo total de incidente."; conf = "Baixa"; }
    investimento = {
      investimento: inv,
      exposicao_sem: r(totalEsperado * q.horizonte_anos),
      exposicao_com: r(totalCom * q.horizonte_anos),
      economia: r(economia),
      roi: r(roi * 100, 1),
      payback_anos: payback !== null ? r(payback, 1) : null,
      recomendacao: rec, confianca: conf,
    };
  }

  // sensibilidade do total à P(multa ANPD)
  const grid = [0.001, 0.005, 0.01, 0.02, 0.05, 0.10, 0.20];
  const sensibilidade = grid.map((p) => ({
    p,
    total: r(sem.litigioEsperado + pBreach0 * p * sem.anpdSeMultar),
  }));

  const setorMult = get(SETOR_DANO_MULT, q.setor, 1.0);
  const setorN = get(SETOR_N, q.setor, 0);
  const setorTipo = q.setor === "geral" ? "nacional" : (setorN > 0 ? "real" : "estimado");

  return {
    parametros: q,
    prob: { p_breach: r(pBreach0, 4), p_sue: r(pSue, 5), p_multa: r(pMulta, 4) },
    esperado: {
      litigio: r(sem.litigioEsperado),
      anpd: r(sem.anpdEsperado),
      total: r(totalEsperado),
      processos: r(sem.processos, 1),
      afetados: sem.usuariosAfetados,
    },
    pior_caso: {
      litigio_se_vazar: r(sem.litigioSeVazar),
      anpd_se_multar: r(sem.anpdSeMultar),
      total: r(piorCaso),
    },
    ibm: {
      por_incidente: sem.ibmPorIncidente,
    },
    setor_info: { mult: setorMult, n: setorN, tipo: setorTipo },
    procedencia: { taxa: r(sem.taxaEfetiva, 4), regime: sem.regimeDano },
    investimento,
    sensibilidade,
  };
}
