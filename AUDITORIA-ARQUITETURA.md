# Auditoria de Arquitetura — Apps (ferramentas estáticas)

> Base: Janilo/apps (branch atual). Stack: HTML + ES modules vanilla, sem build, Cloudflare Pages. App atual: RiskJud (LGPD).
> Referência: Matt Pocock, "Software Fundamentals Matter More Than Ever" (https://www.youtube.com/watch?v=v4F1gFy-hqg).
> Escopo: arquitetura (fatias, módulos, interfaces, testes) adaptada a um contexto estático/vanilla. Não avalia UI, copy ou a validade jurídica dos números — só como o código está organizado.

---

## Sumário executivo

| Princípio | Nota | Veredito em 1 linha |
|---|---|---|
| 1 · Linguagem ubíqua (DDD) | ✅ | `model.mjs` fala LGPD fluente: `regimeDano`, `litigioEsperado`, `anpdSeMultar`, `PROCEDENCIA_FATOR`, `in re ipsa` — domínio e código são a mesma língua. |
| 2 · Fatias verticais | ✅ | `/riskjud` é uma capacidade completa (view + modelo + dados) que roda ponta-a-ponta sem servidor. Fatia quase-ideal. |
| 3 · TDD | 🔴 | Zero testes sobre matemática pura, determinística e calibrada em dado de tribunal. É o alvo mais fácil e mais perigoso do portfólio. |
| 4 · Módulos profundos (Ousterhout) | ✅ | `analisar(params, data)` é uma boca só escondendo ~15 constantes e 8 funções de cálculo. Interface pequena, implementação densa. |
| 5 · Ocultação de informação & design de sistema | 🟡 | `data.json` é uma boa fronteira de calibração e o hub está documentado; mas números jurídicos e a paleta vazam/duplicam entre camadas, e a *proveniência* da calibração vive em prosa no HTML, não versionada ao lado do dado. |

**Tese.** A leitura do Pocock é que código não é o gargalo — julgamento é; a IA é um programador tático brilhante que precisa de um estrategista. Aqui a natureza estática/no-build **joga a favor** de quase todos os fundamentos, não contra. A fatia vertical, que em apps com framework exige disciplina, aqui é o *default físico*: uma pasta = uma ferramenta = UI + lógica + dado, sem acoplamento a runtime. O módulo profundo já existe: `analisar()` é uma função pura `(params, data) → resultado`. A linguagem ubíqua é genuinamente boa. As duas lacunas reais são as que o Pocock mais destacaria: (a) **não há testes** sobre a única coisa que *precisa* estar certa — a conta de risco jurídico calibrada em jurisprudência; e (b) a **proveniência da calibração** (de onde saem `0.6967`, `11346.43`, os multiplicadores) não está versionada junto ao dado, então o "mapa vivo" do sistema depende de um `<details>` de HTML. Ambas são baratas de corrigir sem abandonar a filosofia no-build (`node --test` nativo; um bloco de metadados no `data.json`).

---

## A arquitetura em uma tela

```
apps/                         (Cloudflare Pages · estático · sem build)
├── index.html                hub: lista os apps (fatia = card → /riskjud/)
├── site-chrome.css           chrome compartilhado (header/footer, classes sc-*)
├── README.md                 mapa do sistema (documented system — Pocock +)
├── .github/workflows/        deploy.yml → wrangler pages deploy
└── riskjud/                  ── FATIA VERTICAL ────────────────────────────
    ├── index.html            VIEW: DOM, inputs, Plotly, permalink, formatação
    ├── model.mjs             LÓGICA: analisar(params, data) — matemática pura
    └── data.json             DADOS: benchmark + jurisprudência + fonte (calibração)
```

Fronteiras desenhadas (o "molde" para futuros apps):

- **view ↔ modelo:** `index.html:341` `import { analisar } from './model.mjs'`. O HTML lê inputs (`readParams`, :352), chama `analisar`, formata a saída. Uma única superfície.
- **modelo ↔ dados:** `analisar(params, data)` recebe `data` por parâmetro (:167); a calibração não é `import`-ada nem embutida — o HTML injeta via `fetch('./data.json')` (:499). Boa inversão: o modelo não sabe de onde o dado vem.
- **chrome compartilhado:** `site-chrome.css` (`../site-chrome.css`, :11) é a fronteira comum entre hub e apps.

---

## 1 — Linguagem ubíqua

**Nota: ✅**

Este é um ponto forte real. O vocabulário do domínio jurídico/LGPD aparece intacto no código, não traduzido para termos genéricos de programação.

- Funções nomeadas pelo conceito de domínio, não pela mecânica: `pBreachBase` (`model.mjs:70`), `pSueBase` (:75), `pMultaBase` (:88), `regimeDano` (:116), `gravidadeMax` (:105), `dataAttractiveness` (:61), `investmentEffectiveness` (:97).
- Constantes que carregam a doutrina: `PROCEDENCIA_FATOR = { presumido, misto, comprovar }` (`model.mjs:21`) mapeia direto o regime de dano do STJ; `ANPD_MULTA_MAX`/`ANPD_MULTA_PCT` (:32–33) são o Art. 52 nomeado; `FATOR_RESPONSABILIDADE_SOLIDARIA` (:39) é o Art. 42.
- A saída de `analisar` (`model.mjs:219–241`) é um dicionário em português do domínio: `esperado.litigio`, `esperado.anpd`, `pior_caso.litigio_se_vazar`, `pior_caso.anpd_se_multar`, `procedencia.regime`. O HTML consome esses mesmos nomes (`res.pior_caso`, :377; `res.procedencia.taxa`, :388) — **view e modelo falam a mesma língua**, sem camada de tradução.
- Os comentários ancoram o código na fonte doutrinária, não em jargão técnico: `dano presumido (in re ipsa)` (:20, :114), `taxa-base medida no agregado (0,6967)` (:20), `Art. 52 LGPD` (:31). Isso é exatamente o "glossário executável" que o Pocock defende.
- Os IDs do HTML espelham o domínio: `#p_breach`, `#p_sue`, `#p_multa`, `#d_saude`, `#reincidencia`, `#provas` (`index.html:164–206`), e o `data.json` idem (`valor_medio_causa`, `taxa_procedencia`, `datajud_por_ano`).

Ressalva menor (não derruba a nota): há uma leve inconsistência PT/EN interna ao modelo — variáveis locais em inglês (`affected`, `benchmark`, `impactoReduction`, :125–139) convivem com o vocabulário PT do domínio. É idiomático em JS e não vaza para a interface pública, mas para um glossário 100% consistente o ideal é uma língua só nos nomes de domínio.

---

## 2 — Fatias verticais

**Nota: ✅ (força natural — creditada)**

Aqui a arquitetura estática **é** a fatia vertical, sem esforço. Cada pasta (`/riskjud`) é uma capacidade de negócio completa e independente: interface (`index.html`), regra (`model.mjs`) e dado (`data.json`), rodando ponta-a-ponta no navegador, sem backend, sem estado compartilhado com outros apps. É o oposto da "arquitetura em camadas horizontais" que o Pocock critica — não existe um "camada de serviços" global que todo app tenha que atravessar. Adicionar/remover um app é adicionar/remover uma pasta. **Isto deve ser creditado como um caso quase-ideal de vertical slice** e preservado.

Dentro da fatia, os limites entre as três camadas estão em sua **maioria** limpos — mas há vazamentos concretos a corrigir:

**O que está limpo:**
- A lógica de risco está toda em `model.mjs`. O `<script>` do HTML (:340–525) orquestra (lê DOM, chama `analisar`, desenha Plotly) mas **não** contém a conta de risco — não há `pBreach *`, `valor * taxa` nem afins no HTML. Isso é o mais importante e está certo.
- O dado de calibração está fora do código, em `data.json`.

**O que vaza (view fazendo trabalho de modelo):**
- `index.html:403` calcula `t.anpd_se_multar / p.faturamento_brasil * 100` — "multa como % do faturamento" é uma **métrica de domínio** (quão perto do teto do Art. 52), computada na view. Deveria sair pronta de `analisar` (ex.: `pior_caso.anpd_pct_faturamento`).
- `index.html:391` calcula `e.total / p.base_usuarios` ("exposição por usuário/ano") — de novo, uma grandeza do modelo derivada no HTML. O modelo já expõe `por usuário` como conceito na UI (:220); a conta pertence a ele.
- `index.html:388` reaplica `res.procedencia.taxa * 100` para exibir "proc. XX%". Formatação de percentual (`*100`) para display é tolerável, mas repare que `fmtPct` (:346) já existe para isso e não está sendo usado aqui — inconsistência que espalha a regra de apresentação.

Nenhum desses é grave, mas são exatamente o tipo de "lógica que vaza para a view" que o Pocock aponta: com o tempo, a fatia perde a propriedade de que "toda a regra mora no modelo".

**O que vaza (número mágico entrando no modelo):** ver Princípio 5 — os limites do Art. 52 (`ANPD_MULTA_MAX`, `ANPD_MULTA_PCT`) estão cravados no `model.mjs` em vez de virem por `data.json` como o resto da calibração.

---

## 3 — TDD

**Nota: 🔴 (a lacuna central da auditoria)**

**Estado atual: zero testes.** Não há `package.json`, nem test runner, nem nenhum `*.test.*` no repositório (verificado). O `.gitignore` prevê `node_modules/` mas nada é instalado.

Este é o achado mais importante do documento, e é onde a tese do Pocock morde com mais força. `model.mjs` é **matemática pura e determinística**: `analisar(params, data)` não toca DOM, rede, relógio nem aleatório — mesmo input, mesmo output, sempre. É o alvo de teste mais fácil de todo o portfólio de sites do usuário. E é também o **mais perigoso se estiver errado**: os números são jurídicos, calibrados contra dado de tribunal (`data.json`: 675 acórdãos, 4.878 processos, `calibracao_erro: 0.086`), e vão parar num board via "Salvar PDF" (`index.html:518`). Um erro de sinal ou um limite trocado sai como um número de risco com aparência de autoridade. Pocock: quanto mais a IA acelera a escrita, mais os testes são a rede que segura a regressão — e regra de negócio calibrada é o caso canônico de "teste isto primeiro".

**A correção é barata e coerente com a filosofia no-build.** `model.mjs` já é um ES module puro; o Node 22 (presente no ambiente) tem test runner nativo (`node --test`), **zero dependências**, sem bundler. Não há tensão com o "sem build": os testes rodam direto no arquivo `.mjs`.

Passos concretos:

1. Criar `riskjud/model.test.mjs` (ao lado do modelo — a fatia inclui seu próprio teste).
2. Rodar com `node --test riskjud/` (ou `node --test` na raiz). Um `package.json` mínimo só com `"scripts": { "test": "node --test" }` é opcional e não adiciona dependência.
3. Opcional: um passo `test` no `deploy.yml` antes do `pages deploy`, para travar deploy com modelo quebrado.

Esboço (ilustrativo — nomes reais do módulo):

```js
// riskjud/model.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analisar } from './model.mjs';
import data from './data.json' with { type: 'json' };

const base = { base_usuarios: 100000, faturamento_brasil: 50_000_000,
               dados_pessoais: true, setor: 'geral' };

test('monotonicidade: mais afetados ⇒ litígio esperado não diminui', () => {
  const peq = analisar({ ...base, cenario_vazamento: 'pequeno' }, data);
  const gra = analisar({ ...base, cenario_vazamento: 'grande'  }, data);
  assert.ok(gra.esperado.litigio >= peq.esperado.litigio);
});

test('limites: sem faturamento ⇒ multa ANPD esperada e pior caso zeram', () => {
  const r = analisar({ ...base, faturamento_brasil: 0 }, data);
  assert.equal(r.esperado.anpd, 0);
  assert.equal(r.pior_caso.anpd_se_multar, 0);
});

test('teto do Art. 52: multa nunca passa de R$ 50M nem de 2% do faturamento', () => {
  const r = analisar({ ...base, faturamento_brasil: 10_000_000_000,
                       dados_saude: true, p_multa_override: 1 }, data);
  assert.ok(r.pior_caso.anpd_se_multar <= 50_000_000);
});

test('teto de litigância: P(sue) efetiva respeita o cap de 5%', () => {
  const r = analisar({ ...base, dados_saude: true, reincidencia: true }, data);
  assert.ok(r.prob.p_sue <= 0.05);
});

test('override vence o default de P(vazamento)', () => {
  const r = analisar({ ...base, p_breach_override: 0.5 }, data);
  assert.equal(r.prob.p_breach, 0.5);
});
```

**O que testar primeiro (por prioridade de risco):**
- **Monotonicidade do preço:** subir cenário (pequeno→esperado→grande), base de usuários, faturamento ou reincidência **nunca** deve *reduzir* a exposição correspondente. É a propriedade que o board confia sem perceber.
- **Limites/tetos jurídicos:** `P_SUE_CAP = 0.05` (`model.mjs:28`), `ANPD_MULTA_MAX = 50_000_000` e `ANPD_MULTA_PCT` (:32–33), `Math.min(..., 0.90)` de `pBreachBase` (:72), `Math.min(taxa, 0.95)` (:135). Cada `Math.min`/`Math.max` do modelo é uma regra que merece um teste de fronteira.
- **Casos de calibração conhecidos do `data.json`:** com `valor_medio_causa = 11346.43` e `taxa_procedencia = 0.6967`, um cenário-âncora deve reproduzir um litígio esperado dentro de uma faixa esperada — o teste que pega se alguém editar o `data.json` e quebrar a ordem de grandeza.
- **`faturamento_brasil = 0` ⇒ ANPD zera** (`model.mjs:149–152`) — regra silenciosa fácil de regredir.
- **Regime de dano** (`regimeDano`, :116): saúde/cartão → `presumido`; só pessoal → `comprovar`. Mapa doutrinário que não pode inverter.

---

## 4 — Módulos profundos (Ousterhout)

**Nota: ✅**

`model.mjs` é um módulo profundo no sentido exato do Ousterhout que o Pocock cita: **interface estreita, implementação funda**. A superfície pública é uma única função:

```js
export function analisar(params, data) { ... }   // model.mjs:167
```

Uma entrada (`params` + `data`), uma saída (o objeto de resultado). Atrás dessa boca há ~15 tabelas de constantes calibradas (`PORTE_BREACH_BASE`, `SETOR_DANO_MULT`, `P_SUE_PERCAPITA`, `ANPD_GRAVIDADE`, `IBM_CODB`…) e 8 funções internas **não exportadas** (`pBreachBase`, `pSueBase`, `pMultaBase`, `dataAttractiveness`, `investmentEffectiveness`, `gravidadeMax`, `regimeDano`, `componentes`). Nada disso escapa: o único `export` do arquivo é `analisar`. O chamador (HTML) **não conhece os internos** — não sabe o que é `componentes()` nem `FATOR_RESPONSABILIDADE_SOLIDARIA`; só passa parâmetros e lê `res.esperado`/`res.pior_caso`. Isso é o oposto do módulo raso/pass-through.

Sinais concretos de profundidade:
- `params` aceita defaults internos (`DEFAULTS`, `model.mjs:50`; `const q = { ...DEFAULTS, ...params }`, :168) — o chamador pode passar pouco e o módulo completa. Interface tolerante.
- O sistema de override (`p_breach_override` etc., :171–174) permite substituir qualquer probabilidade sem o HTML saber *como* o default foi calculado — o `pBreachBase` fica escondido.
- Detalhes matemáticos delicados ficam encapsulados: a curva contínua/saturante do investimento (`investmentEffectiveness`, :97–103) troca um degrau por `rp = 0.75*perUser/(perUser+4)` — o HTML nem sabe que essa decisão existe. É complexidade absorvida pelo módulo, exatamente o que Ousterhout pede.

Ponto de atenção (não derruba a nota, mas é a única rachadura na interface): o resultado é um objeto grande e "plano" com ~9 seções (`prob`, `esperado`, `pior_caso`, `ibm`, `setor_info`, `procedencia`, `investimento`, `sensibilidade`, `parametros`). Ainda é uma interface só, mas quanto mais campos derivados o HTML tiver que *recompor* (ver os cálculos vazados no Princípio 2: `%` do faturamento, por-usuário), mais a interface começa a "vazar internos" pela ausência. A profundidade se mantém movendo essas derivações **para dentro** de `analisar`.

**`data.json` como fronteira de configuração:** confirmado lendo os três arquivos. A calibração (`valor_medio_causa`, `taxa_procedencia`, séries por UF, `data_coleta`) vive fora do código, e o modelo a recebe por parâmetro. Isso é bom *information hiding*: mudar a jurisprudência é editar um JSON, sem tocar na lógica. **Exceção que quebra parcialmente a fronteira:** os limites do Art. 52 (`ANPD_MULTA_MAX`, `ANPD_MULTA_PCT`) e a referência IBM (`IBM_CODB`, :44) estão **hard-coded no `.mjs`**, embora `data.json` já tenha um `ibm_codb_2025_brasil` (:110) — ou seja, o mesmo tipo de número mora nos dois lugares. Ver Achado A3.

---

## 5 — Ocultação de informação & design de sistema

**Nota: 🟡**

**Positivos (creditados):**
- **Sistema documentado.** O `README.md` é o "mapa vivo" que o Pocock valoriza: descreve o que é cada app, a estrutura de pastas e o deploy. Para um portfólio de ferramentas, é a fronteira de entendimento correta.
- **Metodologia exposta ao usuário.** O `<details class="method">` (`index.html:110–126`) separa "dado medido" de "juízo editorial" com honestidade rara — diz explicitamente que P(vazamento), P(multa) e multiplicadores são premissas, não fatos. Isso é design consciente: a incerteza está *na interface*, não escondida.
- **Boa ocultação na dupla modelo/dados.** Como visto no Princípio 4, `data.json` mantém a calibração fora do código.

**Lacunas (o que puxa para 🟡):**

**(a) Proveniência da calibração não está versionada junto ao dado.** `data.json` traz os *valores* (`taxa_procedencia: 0.6967`) e alguns metadados de fonte (`datajud_processos: 4878`, `data_coleta: "2026-06-27"`, `calibracao_erro: 0.086`), o que é bom. Mas *como* esses números foram derivados — a metodologia de coleta, quais tribunais, como se chegou a `0.086`, por que `SETOR_DANO_MULT.varejo = 1.55` — vive só em **prosa de HTML** (`index.html:113–124`, :288) e em comentários do `.mjs` (:13–16, :26). O "mapa" da calibração depende de texto de UI. Se o RiskJud v2.2 recalibrar (o próprio HTML pede: "recalibrar periodicamente", :291), não há um artefato versionado que diga de onde veio cada número. Recomendação: um bloco `_meta`/`metodologia` no `data.json` (ou um `riskjud/CALIBRACAO.md` ao lado do dado) com fonte, data, método e a origem de cada multiplicador editorial.

**(b) Duplicação de números jurídicos entre camadas.** Os mesmos valores aparecem cravados em prosa no HTML **e** no dado/modelo, sem fonte única:
- IBM: `data.json:110` `ibm_codb_2025_brasil: 7190000` **e** `model.mjs:44` `IBM_CODB._default: 7_190_000` **e** `index.html:238,288` como texto "R$ 7,2–11,4 mi" / "R$ 7,19M". Três cópias.
- Art. 52: `model.mjs:32–33` (`50_000_000`, `0.02`) **e** `index.html:119,231` como texto "R$ 50M" / "2% do faturamento".
- Estatísticas de calibração: `11.346`, `5.000`, `4.878`, `813` aparecem em `data.json` **e** hard-coded em prosa no HTML (`index.html:116–117,124,275,288`). Se o `data.json` for atualizado, o texto do HTML fica mentindo silenciosamente. Onde possível, o HTML já injeta do dado (`renderContext`, :448–455 lê `j.valor_mediano`, `f.datajud_por_ano` etc. — **bom**), mas o `<details>` de metodologia e o rodapé repetem os números à mão.

**(c) Duplicação da paleta — dependência oculta entre chrome e apps.** As cores da marca estão definidas **três vezes** com os mesmos hex:
- `site-chrome.css:5` como `--sc-purple:#4a1942; --sc-gold:#c9a227;`
- `index.html:14` (hub) como `--marine/--purple/--green/--gold`
- `riskjud/index.html:15` (app) como o mesmo conjunto
- e, pior, **12 ocorrências de hex cravado** dentro do `<script>` do RiskJud (`#0F2940`, `#2E5D4F`, `#C9A227`, `#E6E9ED`) nas configs do Plotly (`index.html:429–463`), sem passar por variável.

`site-chrome.css` é uma **boa fronteira comum** para header/footer (classes `sc-*` namespaced, escopadas — isso está certo). O problema é que ele **não expõe a paleta como contrato**: cada página redefine os tokens localmente, então "a cor da marca" não tem dono. Trocar `--gold` exige editar 3 arquivos + 12 literais. É exatamente a "dependência oculta" que o Pocock descreve: parece que `site-chrome.css` centraliza o visual, mas na prática cada app carrega sua própria cópia. Recomendação: `site-chrome.css` publica os tokens de marca (`--brand-marine` etc.) no `:root`; hub e apps consomem via `var(--brand-*)`; o Plotly lê `getComputedStyle` ou constantes JS derivadas dessas vars.

**(d) O "molde" para novos apps não está escrito.** O README descreve a estrutura (`index.html + model.mjs + data.json`), mas não há um template/scaffold nem um `CONTRIBUTING`/`TEMPLATE.md` dizendo as convenções (modelo puro, dado injetado por parâmetro, teste ao lado, tokens via `site-chrome`). Hoje o segundo app seria criado por *cópia-e-cola* do RiskJud — e herdaria os vazamentos acima. Para um portfólio que se pretende extensível, o molde deveria ser explícito. Baixa prioridade, mas é o que garante que a fatia vertical continue limpa no app nº 2.

---

## Achados priorizados

### A1 · Sem testes sobre a matemática pura calibrada (P0)
- **Arquivo:** `riskjud/model.mjs` (ausência de `riskjud/model.test.mjs`).
- **Sintoma:** `analisar(params, data)` é pura e determinística, produz números jurídicos que vão a um board, e não tem nenhum teste. Qualquer edição (regra ou `data.json`) pode inverter um sinal ou estourar um teto sem ninguém perceber.
- **Princípio ferido:** 3 (TDD).
- **Correção:** criar `riskjud/model.test.mjs` com `import { test } from 'node:test'` (zero deps, coerente com no-build); rodar `node --test`. Cobrir, nesta ordem: monotonicidade (cenário/base/faturamento/reincidência não reduzem a exposição), tetos (`P_SUE_CAP` :28, `ANPD_MULTA_MAX`/`_PCT` :32–33, `min 0.90` :72, `min 0.95` :135), `faturamento=0 ⇒ anpd=0` (:149–152), `regimeDano` (:116), e um caso-âncora contra os valores de `data.json`. Esboço completo na seção 3. Opcional: passo `test` no `deploy.yml` antes do `pages deploy`.
- **Aceite:** `node --test` roda verde localmente e cobre pelo menos monotonicidade + os 4 tetos + 1 caso-âncora de calibração; um erro deliberado de sinal no litígio faz um teste falhar.

### A2 · Cálculos de domínio vazam do modelo para a view (P1)
- **Arquivo:** `riskjud/index.html:391` (`e.total / p.base_usuarios`), `:403` (`t.anpd_se_multar / p.faturamento_brasil * 100`).
- **Sintoma:** grandezas do domínio (exposição por usuário; multa como % do faturamento — proximidade do teto do Art. 52) são calculadas no HTML, não no modelo. Não há teste possível sobre elas e a regra fica em dois lugares.
- **Princípio ferido:** 2 (fatia vertical — lógica na view) e 4 (interface do módulo vazando por ausência de campo).
- **Correção:** mover as duas derivações para dentro de `analisar` e expô-las prontas — ex.: `esperado.por_usuario` e `pior_caso.anpd_pct_faturamento` no objeto de retorno (`model.mjs:219–241`); o HTML passa a só formatar. Reaproveitar `fmtPct` (:346) onde hoje há `*100` solto (`:388`).
- **Aceite:** `index.html` não contém nenhuma divisão/multiplicação que produza um número de negócio (só formatação); os novos campos têm teste em `model.test.mjs`.

### A3 · Constantes legais e referência IBM cravadas no modelo, não em `data.json` (P1)
- **Arquivo:** `riskjud/model.mjs:32–33` (`ANPD_MULTA_MAX`, `ANPD_MULTA_PCT`), `:44` (`IBM_CODB`).
- **Sintoma:** o teto do Art. 52 e o custo IBM são *parâmetros calibráveis/legais* embutidos no código, enquanto o resto da calibração vive em `data.json` — que, aliás, já tem `ibm_codb_2025_brasil` (`data.json:110`), duplicando o valor. A fronteira "código = lógica / json = calibração" fura aqui.
- **Princípio ferido:** 4 e 5 (ocultação de informação / fronteira de configuração).
- **Correção:** mover esses números para `data.json` (ex.: bloco `anpd: { multa_max, multa_pct }` e usar o `ibm_codb` já existente), lidos via o parâmetro `data` que `analisar` já recebe. O modelo deixa de conhecer valores; passa a conhecer só a fórmula.
- **Aceite:** `model.mjs` não contém `50_000_000`, `0.02` de multa nem os valores IBM; todos vêm de `data`. Trocar o teto no JSON muda o resultado sem editar o `.mjs`.

### A4 · Proveniência da calibração vive em prosa de HTML, não versionada ao lado do dado (P1)
- **Arquivo:** `riskjud/data.json` (falta metadados de método), vs. `riskjud/index.html:113–124,288` (metodologia em texto).
- **Sintoma:** os *valores* estão no JSON, mas *de onde vêm* e *como foram derivados* (tribunais, método, origem de cada multiplicador editorial como `SETOR_DANO_MULT.varejo=1.55`) só existem como copy de UI e comentários. O HTML pede recalibração periódica (:291), mas não há artefato versionado que documente a base.
- **Princípio ferido:** 5 (design de sistema / mapa vivo).
- **Correção:** adicionar um bloco `metodologia`/`_meta` ao `data.json` (fonte, período, tribunais, como se obteve `taxa_procedencia` e `calibracao_erro`, e a justificativa de cada multiplicador editorial), **ou** um `riskjud/CALIBRACAO.md` ao lado do dado. A prosa do HTML passa a referenciar essa fonte única.
- **Aceite:** existe um artefato versionado (JSON ou MD) que documenta a origem de cada número calibrado; a metodologia do HTML não introduz nenhum valor que não esteja lá.

### A5 · Paleta da marca duplicada em 3 arquivos + 12 hex cravados (P2)
- **Arquivo:** `site-chrome.css:5`, `index.html:14`, `riskjud/index.html:15`, e literais `#0F2940/#2E5D4F/#C9A227/#E6E9ED` em `riskjud/index.html:429–463` (12 ocorrências).
- **Sintoma:** "a cor da marca" não tem dono. `site-chrome.css` parece centralizar o visual, mas cada página redefine os tokens e o Plotly usa hex cru — dependência oculta. Trocar `--gold` exige editar 3 arquivos + 12 literais.
- **Princípio ferido:** 5 (ocultação de informação — dependência oculta / DRY na fronteira comum).
- **Correção:** `site-chrome.css` publica os tokens de marca no `:root` (ex.: `--brand-marine`, `--brand-gold`); hub e app consomem via `var(--brand-*)` em vez de redefinir; no `<script>` do Plotly, ler as cores de `getComputedStyle(document.documentElement)` ou de um pequeno objeto JS derivado das vars, eliminando os literais.
- **Aceite:** cada hex da paleta aparece uma única vez (em `site-chrome.css`); `riskjud/index.html` não contém `#0F2940`/`#C9A227` etc. no `<script>`; trocar a cor num lugar propaga para hub, app e gráficos.

### A6 · Números de calibração hard-coded em prosa podem divergir do `data.json` (P2)
- **Arquivo:** `riskjud/index.html:116–117,124,238,275,288` (texto "11.346", "5.000", "4.878", "813", "R$ 7,2–11,4 mi").
- **Sintoma:** os mesmos valores que `renderContext` (:448–455) já injeta do `data.json` estão também escritos à mão na metodologia e no rodapé. Atualizar o dado deixa a prosa desatualizada em silêncio.
- **Princípio ferido:** 5 (fonte única de verdade).
- **Correção:** onde a prosa cita um número que existe no `data.json`, injetá-lo por `textContent` (como já se faz nos `#c_*`) ou aceitar a duplicação apenas para valores realmente estáticos, marcando-os. Prioridade baixa porque `renderContext` já faz a parte crítica certa.
- **Aceite:** nenhum número de calibração que exista no `data.json` aparece também cravado como texto no HTML; ou, se aparecer, há um comentário justificando.

### A7 · Molde para novos apps não documentado (P2)
- **Arquivo:** `README.md` (descreve estrutura, não convenções), ausência de `TEMPLATE.md`/scaffold.
- **Sintoma:** o segundo app nasceria por cópia do RiskJud e herdaria os vazamentos A2/A3/A5. As convenções que mantêm a fatia limpa (modelo puro, dado por parâmetro, teste ao lado, tokens via chrome) não estão escritas.
- **Princípio ferido:** 2 e 5 (consciência de design de sistema — o molde).
- **Correção:** uma seção "Como criar um app" no `README.md` (ou `TEMPLATE.md`) fixando: pasta própria; `model.mjs` puro exportando uma função `(params, data)`; `data.json` com dado + metadados; `model.test.mjs` com `node --test`; cores via `var(--brand-*)`. Opcional: uma pasta `_template/` mínima.
- **Aceite:** existe documentação que um novo app pode seguir sem ler o RiskJud inteiro, e que menciona explicitamente as 4 convenções acima.

---

## O que já está certo (não regredir)

- **Fatia vertical natural (Princípio 2):** `/riskjud` = UI + modelo + dado, ponta-a-ponta, sem servidor. Preservar como o padrão do repositório.
- **Módulo profundo (Princípio 4):** `analisar(params, data)` é a única superfície pública (`model.mjs:167`); todo o cálculo e ~15 tabelas ficam escondidos. Não exportar internos.
- **Injeção do dado por parâmetro:** `analisar(params, data)` recebe a calibração de fora (`index.html:499` `fetch('./data.json')`), o modelo não a importa. Boa inversão — manter.
- **Linguagem ubíqua (Princípio 1):** nomes de domínio no modelo, no `data.json` e nos IDs do HTML; comentários ancorados em STJ/Art. 42/Art. 52. Manter ao adicionar regras.
- **Honestidade de incerteza na UI:** o `<details class="method">` (`index.html:110–126`) separa "dado medido" de "juízo editorial". É design consciente — não esconder isso em refactors.
- **`renderContext` injeta do dado (`index.html:448–455`):** os stats de contexto vêm do `data.json`, não cravados. Estender esse padrão (ver A6), não abandoná-lo.
- **Determinismo do modelo:** sem DOM/rede/`Date`/`Math.random` em `model.mjs`. É o que torna A1 barato — manter puro.
- **Chrome namespaced (`site-chrome.css`):** classes `sc-*` escopadas a header/footer são uma boa fronteira comum. O problema é só a paleta (A5), não o chrome em si.
- **Guarda de deploy (`deploy.yml:17–22`):** só publica se o secret existir — evita run vermelho. Bom detalhe operacional; é o ponto natural para pendurar o passo de teste (A1).

---

## Checklist de verificação

- [ ] `node --test` existe e roda verde em `riskjud/model.test.mjs` (A1).
- [ ] Os testes cobrem: monotonicidade (cenário/base/faturamento/reincidência), `P_SUE_CAP`, teto Art. 52 (R$ 50M e 2%), `min 0.90`/`min 0.95`, `faturamento=0 ⇒ anpd=0`, `regimeDano`, e 1 caso-âncora vs. `data.json` (A1).
- [ ] Um erro deliberado de sinal no litígio faz **pelo menos um** teste falhar (A1).
- [ ] `riskjud/index.html` não contém nenhuma conta que produza número de negócio (só formatação); "por usuário" e "% do faturamento" saem de `analisar` (A2).
- [ ] `model.mjs` não contém `50_000_000`, `0.02` de multa nem os valores IBM cravados — todos vêm de `data` (A3).
- [ ] Existe artefato versionado (`data.json._meta` ou `CALIBRACAO.md`) com a proveniência de cada número calibrado (A4).
- [ ] Cada hex da paleta aparece uma vez só (em `site-chrome.css`); nenhum `#0F2940`/`#C9A227` no `<script>` do RiskJud (A5).
- [ ] Nenhum número de calibração que exista no `data.json` está também cravado como texto no HTML sem justificativa (A6).
- [ ] `README.md` (ou `TEMPLATE.md`) documenta o molde de um novo app: pasta + `model.mjs` puro `(params, data)` + `data.json` com metadados + `model.test.mjs` + tokens `var(--brand-*)` (A7).
