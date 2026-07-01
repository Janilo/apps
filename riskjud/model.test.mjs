// Tests for the RiskJud legal-risk model. Pure, deterministic math calibrated on
// court data (data.json) and exported to a board via PDF — so it must have a net.
// Zero deps, no build: run with `node --test` (Node 18+).
//
//   cd apps && node --test        # or: node --test riskjud/model.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { analisar } from "./model.mjs";

const data = JSON.parse(readFileSync(new URL("./data.json", import.meta.url), "utf8"));

// Representative sensitive-data scenario reused across cases.
const base = {
  base_usuarios: 100_000,
  dados_financeiros: true,
  maturidade_seguranca: "basico",
  porte_empresa: "media",
  setor: "financeiro",
  faturamento_brasil: 100_000_000,
  cenario_vazamento: "esperado",
};

test("é determinístico — mesmo input, mesmo output", () => {
  assert.deepEqual(analisar(base, data), analisar(base, data));
});

test("faturamento zero ⇒ multa ANPD zero (esperada e pior caso)", () => {
  const r = analisar({ ...base, faturamento_brasil: 0 }, data);
  assert.equal(r.esperado.anpd, 0);
  assert.equal(r.pior_caso.anpd_se_multar, 0);
});

test("teto do Art. 52 — a multa satura em R$ 50M e não passa disso", () => {
  const enorme = analisar({ ...base, dados_saude: true, faturamento_brasil: 100_000_000_000 }, data);
  const aindaMaior = analisar({ ...base, dados_saude: true, faturamento_brasil: 200_000_000_000 }, data);
  // min(faturamento·2%, 50M)·gravidade ⇒ nunca acima de 50M, e já saturado (plateau).
  assert.ok(enorme.pior_caso.anpd_se_multar <= 50_000_000);
  assert.equal(enorme.pior_caso.anpd_se_multar, aindaMaior.pior_caso.anpd_se_multar);
});

test("mais maturidade de segurança ⇒ menor P(vazamento)", () => {
  const basico = analisar({ ...base, maturidade_seguranca: "basico" }, data);
  const avancado = analisar({ ...base, maturidade_seguranca: "avancado" }, data);
  assert.ok(avancado.prob.p_breach < basico.prob.p_breach);
});

test("mais usuários na base ⇒ maior litígio esperado (monotônico)", () => {
  const menor = analisar({ ...base, base_usuarios: 100_000 }, data);
  const maior = analisar({ ...base, base_usuarios: 200_000 }, data);
  assert.ok(maior.esperado.litigio > menor.esperado.litigio);
});

test("investimento reduz a exposição modelada", () => {
  const r = analisar({ ...base, investimento_incremental: 500_000 }, data);
  assert.ok(r.investimento, "deve haver bloco de investimento quando > 0");
  assert.ok(r.investimento.exposicao_com < r.investimento.exposicao_sem);
});

test("âncora de calibração — a taxa de procedência vem do data.json", () => {
  // Só dado financeiro ⇒ regime 'misto' (fator 1.0), sem provas ⇒ taxa == taxa_procedencia medida.
  const r = analisar(base, data);
  assert.equal(r.procedencia.regime, "misto");
  assert.equal(r.procedencia.taxa, data.benchmark.taxa_procedencia);
});
