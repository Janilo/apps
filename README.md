# apps

Ferramentas estáticas (client-side) de [Janilo Saraiva](https://pereirasaraiva.com), servidas via Cloudflare Pages em **https://apps.pereirasaraiva.com**.

Cada pasta é um app independente que roda 100% no navegador, sem servidor:

| App | Caminho | O que é |
|---|---|---|
| **RiskJud** | [`/riskjud`](https://apps.pereirasaraiva.com/riskjud) | Precificação de risco LGPD (indenização + multa ANPD), calibrada contra dados reais de tribunal brasileiro. |

A raiz (`index.html`) é a página-hub que lista os apps.

## Estrutura

```
/                 página-hub
/riskjud/         RiskJud (index.html + model.mjs + data.json)
```

## Deploy

Estático, sem build. O Cloudflare Pages serve o repositório direto. Para publicar manualmente:

```bash
npx wrangler pages deploy . --project-name=riskjud
```

## Testes

O modelo do RiskJud (`riskjud/model.mjs`) é matemática pura e determinística, calibrada contra jurisprudência e exportada a conselho via PDF — então tem rede de teste. Sem build e sem dependências, pelo runner nativo do Node (18+):

```bash
node --test riskjud/model.test.mjs
```

Cobre: determinismo, teto do Art. 52 (R$ 50M), `faturamento = 0 ⇒ multa = 0`, monotonicidade (mais maturidade ↓ risco de vazamento; mais usuários ↑ litígio), efeito do investimento na exposição, e a âncora de calibração (`taxa_procedencia` sai do `data.json`, não do código).
