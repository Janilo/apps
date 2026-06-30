// RiskJud — modelo de risco portado de backend/risk_model.py (paridade verificada).
// Determinístico, roda no navegador. Sem servidor.

const PORTE_BREACH_BASE = { mei: 0.12, pequena: 0.20, media: 0.30, grande: 0.40 };
const DATA_TYPE_BREACH_MULT = { financeiro: 1.30, saude: 1.50, cartao: 1.40, pessoal: 1.00 };
const MATURITY_REDUCTION = { basico: 1.00, intermediario: 0.50, avancado: 0.15 };
const BREACH_SCENARIOS = { pequeno: 0.01, esperado: 0.05, grande: 0.15 };

const SETOR_BREACH_MULT = { geral: 1, financeiro: 1, saude: 1, varejo: 1, tecnologia: 1, telecom: 1, seguradora: 1, educacao: 1 };
const SETOR_P_SUE_MULT = { geral: 1, financeiro: 1, saude: 1, varejo: 1, tecnologia: 1, telecom: 1, seguradora: 1, educacao: 1 };
const SETOR_DANO_MULT = { geral: 1, financeiro: 1.26, saude: 1, varejo: 1.55, tecnologia: 1, telecom: 1, seguradora: 1, educacao: 1 };

const P_SUE_BREACH_BASE = { pessoal: 0.0002, financeiro: 0.0010, cartao: 0.0006, saude: 0.0016 };
const PORTE_P_SUE_BREACH_MULT = { mei: 0.1, pequena: 0.5, media: 2.0, grande: 8.0 };
const PORTE_VALOR_MULTIPLIERS = { mei: 0.6, pequena: 0.8, media: 1.0, grande: 1.35 };

const ANPD_MULTA_MAX = 50_000_000;
const ANPD_MULTA_PCT = 0.02;
const ANPD_P_FINE = { basico: 0.35, intermediario: 0.20, avancado: 0.08 };
const ANPD_GRAVIDADE = { pessoal: 0.3, financeiro: 0.6, cartao: 0.5, saude: 0.8 };
const FATOR_RESPONSABILIDADE_SOLIDARIA = 1.2;

const r = (x, n = 2) => Math.round((x + Number.EPSILON) * 10 ** n) / 10 ** n;
const get = (obj, k, def) => (obj[k] !== undefined ? obj[k] : def);

const DEFAULTS = {
  base_usuarios: 100000, dados_financeiros: false, dados_saude: false,
  dados_pessoais: false, dados_cartao: false, maturidade_seguranca: "basico",
  investimento_incremental: 0, horizonte_anos: 3, reincidencia: false,
  provas_concretas: false, porte_empresa: "media", setor: "geral",
  faturamento_brasil: 0,
};

function dataAttractiveness(q) {
  let m = 1.0;
  if (q.dados_saude) m = Math.max(m, DATA_TYPE_BREACH_MULT.saude);
  if (q.dados_cartao) m = Math.max(m, DATA_TYPE_BREACH_MULT.cartao);
  if (q.dados_financeiros) m = Math.max(m, DATA_TYPE_BREACH_MULT.financeiro);
  return m;
}

function pBreach(q) {
  const base = get(PORTE_BREACH_BASE, q.porte_empresa, 0.20);
  const p = base * dataAttractiveness(q) * get(MATURITY_REDUCTION, q.maturidade_seguranca, 1.0);
  return Math.min(p, 0.90);
}

function investmentEffectiveness(investimento, baseUsuarios) {
  const perUser = baseUsuarios > 0 ? investimento / baseUsuarios : 0;
  if (perUser <= 0) return { reducao_probabilidade: 0.0, reducao_impacto: 0.0 };
  if (perUser <= 1) return { reducao_probabilidade: 0.15, reducao_impacto: 0.10 };
  if (perUser <= 3) return { reducao_probabilidade: 0.35, reducao_impacto: 0.25 };
  if (perUser <= 10) return { reducao_probabilidade: 0.55, reducao_impacto: 0.40 };
  return { reducao_probabilidade: 0.75, reducao_impacto: 0.60 };
}

function pSueMedia(q) {
  const tipos = [];
  if (q.dados_financeiros) tipos.push("financeiro");
  if (q.dados_saude) tipos.push("saude");
  if (q.dados_cartao) tipos.push("cartao");
  if (q.dados_pessoais) tipos.push("pessoal");
  if (tipos.length === 0) return 0.0;
  const base = Math.max(...tipos.map((t) => P_SUE_BREACH_BASE[t]));
  const porteMult = get(PORTE_P_SUE_BREACH_MULT, q.porte_empresa, 1.0);
  const setorMult = get(SETOR_P_SUE_MULT, q.setor, 1.0);
  const usersFactor = Math.min(q.base_usuarios / 50000, 3.0);
  return Math.min(base * porteMult * setorMult * usersFactor, 0.30);
}

function expectedLawsuits(afetados) {
  if (afetados <= 0) return 0.0;
  return Math.min(1 + afetados / 2000, afetados * 0.05);
}

function ajustarTaxa(taxa, q) {
  return q.provas_concretas ? Math.min(taxa * 1.2, 0.95) : taxa;
}
function ajustarValorPorte(v, q) {
  return v * get(PORTE_VALOR_MULTIPLIERS, q.porte_empresa, 1.0);
}
function ajustarValorReincidencia(v, q) {
  return q.reincidencia ? v * 1.2 : v;
}
function ajustarPSue(p, q) {
  return q.reincidencia ? Math.min(p * 2.0, 0.6) : p;
}

function multaAnpd(q, pBreachVal) {
  if (q.faturamento_brasil <= 0) return { multa_esperada: 0.0, multa_cenario_breach: 0.0 };
  let pFine = get(ANPD_P_FINE, q.maturidade_seguranca, 0.20);
  if (q.reincidencia) pFine = Math.min(pFine * 1.5, 0.80);
  const maxFine = Math.min(q.faturamento_brasil * ANPD_MULTA_PCT, ANPD_MULTA_MAX);
  const tipos = [];
  if (q.dados_saude) tipos.push("saude");
  if (q.dados_financeiros) tipos.push("financeiro");
  if (q.dados_cartao) tipos.push("cartao");
  if (q.dados_pessoais) tipos.push("pessoal");
  const gravidade = tipos.length ? Math.max(...tipos.map((t) => get(ANPD_GRAVIDADE, t, 0.3))) : 0.3;
  const multaCenario = maxFine * gravidade;
  return { multa_esperada: pFine * pBreachVal * multaCenario, multa_cenario_breach: multaCenario };
}

function calcularCenario(q, benchmark, comInvestimento) {
  let p_breach = pBreach(q);
  const atratividade = dataAttractiveness(q);
  let p_sue = ajustarPSue(pSueMedia(q), q);
  p_breach *= get(SETOR_BREACH_MULT, q.setor, 1.0);

  let valor_medio = get(benchmark, "valor_medio_causa", 15000.0);
  let taxa = ajustarTaxa(get(benchmark, "taxa_procedencia", 0.65), q);
  valor_medio = ajustarValorReincidencia(ajustarValorPorte(valor_medio, q), q);
  valor_medio *= get(SETOR_DANO_MULT, q.setor, 1.0);

  let impacto_reduction = 0.0;
  if (comInvestimento && q.investimento_incremental > 0) {
    const ef = investmentEffectiveness(q.investimento_incremental, q.base_usuarios);
    p_breach *= 1 - ef.reducao_probabilidade;
    impacto_reduction = ef.reducao_impacto;
  }

  let affected_pct = Math.min(BREACH_SCENARIOS.esperado * atratividade, 0.5);
  affected_pct *= 1 - impacto_reduction;
  const usuarios_afetados = Math.floor(q.base_usuarios * affected_pct);

  const processos = p_sue * expectedLawsuits(usuarios_afetados);
  const custo_processo = valor_medio * taxa;
  const fator_rs = FATOR_RESPONSABILIDADE_SOLIDARIA;
  const exposure_breach = processos * custo_processo * fator_rs;
  const exposure_esperada = p_breach * exposure_breach;

  const anpd = multaAnpd(q, p_breach);
  const exposure_breach_total = exposure_breach + anpd.multa_cenario_breach;
  const exposure_esperada_total = exposure_esperada + anpd.multa_esperada;

  const perUser = q.base_usuarios > 0 ? exposure_breach_total / q.base_usuarios : 0;
  let nivel = "Baixo";
  if (perUser > 20) nivel = "Crítico";
  else if (perUser > 5) nivel = "Alto";
  else if (perUser > 1) nivel = "Médio";

  return {
    probabilidade_breach_anual: r(p_breach, 4),
    usuarios_afetados_estimados: usuarios_afetados,
    p_sue_breach: r(p_sue, 4),
    processos_esperados: r(processos, 1),
    valor_medio_processo: r(valor_medio * atratividade * taxa, 2),
    exposure_total_esperado: r(exposure_esperada, 2),
    exposure_cenario_breach: r(exposure_breach, 2),
    nivel_risco: nivel,
    porte_multiplier: get(PORTE_VALOR_MULTIPLIERS, q.porte_empresa, 1.0),
    setor_aplicado: q.setor,
    setor_multiplier: r(get(SETOR_DANO_MULT, q.setor, 1.0), 2),
    multa_anpd_esperada: r(anpd.multa_esperada, 2),
    multa_anpd_cenario_breach: r(anpd.multa_cenario_breach, 2),
    fator_responsabilidade_solidaria: r(fator_rs, 2),
    exposure_total_com_anpd: r(exposure_esperada_total, 2),
    exposure_breach_com_anpd: r(exposure_breach_total, 2),
  };
}

function calcularResultado(q, c0, c1) {
  const exposure_sem = c0.exposure_total_com_anpd * q.horizonte_anos;
  const exposure_com = c1.exposure_total_com_anpd * q.horizonte_anos;
  const economia = exposure_sem - exposure_com;
  const investimento = q.investimento_incremental;

  let roi = 0, payback = null;
  if (investimento > 0 && economia > 0) {
    roi = (economia - investimento) / investimento;
    payback = investimento / (economia / q.horizonte_anos);
  }

  let recomendacao, nivel_confianca;
  if (investimento === 0) {
    recomendacao = "Informe um valor de investimento para análise comparativa.";
    nivel_confianca = "Média";
  } else if (roi > 3) {
    recomendacao = "Investimento altamente recomendado. ROI > 300% com retorno esperado superando amplamente o custo.";
    nivel_confianca = "Alta";
  } else if (roi > 1) {
    recomendacao = "Investimento recomendado. Retorno esperado supera o custo em mais de 2x.";
    nivel_confianca = "Alta";
  } else if (roi > 0) {
    recomendacao = "Investimento vale a pena, mas com retorno moderado. Avalie outros fatores qualitativos.";
    nivel_confianca = "Média";
  } else if (economia > 0) {
    recomendacao = "Investimento reduz exposição, mas ROI é baixo. Considere soluções mais custo-efetivas.";
    nivel_confianca = "Média";
  } else {
    recomendacao = "Investimento não se justifica pelo risco jurídico atual. Reveja o montante ou priorize outras áreas.";
    nivel_confianca = "Baixa";
  }

  return {
    investimento,
    exposure_sem_investimento: r(exposure_sem, 2),
    exposure_com_investimento: r(exposure_com, 2),
    economia_esperada: r(economia, 2),
    roi_esperado: r(roi * 100, 1),
    payback_anos: payback !== null ? r(payback, 1) : null,
    recomendacao,
    nivel_confianca,
  };
}

export function analisar(params, data) {
  const q = { ...DEFAULTS, ...params };
  const benchmark = data.benchmark;
  const cenario_atual = calcularCenario(q, benchmark, false);
  let cenario_pos = null, resultado = null;
  if (q.investimento_incremental > 0) {
    cenario_pos = calcularCenario(q, benchmark, true);
    resultado = calcularResultado(q, cenario_atual, cenario_pos);
  }
  return { parametros: q, benchmark, cenario_atual, cenario_pos_investimento: cenario_pos, resultado_investimento: resultado };
}
