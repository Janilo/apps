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
