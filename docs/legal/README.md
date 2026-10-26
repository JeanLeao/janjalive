# Termos de Uso e Política de Privacidade — minutas para revisão

Revisão documental original: 22/10/2026. Versão **0.1 — minuta**, sem data de publicação ou vigência definida. Não constitui parecer ou certificação de conformidade jurídica.

## Fontes e manutenção

As minutas integrais, versão e data estão em [documents.ts](../../apps/web/src/features/legal/documents.ts), nos objetos `terms` e `privacy`. A apresentação compartilhada está em [LegalPage.tsx](../../apps/web/src/features/legal/LegalPage.tsx); as rotas públicas são `/termos` e `/privacidade`.

As páginas apresentam aviso de minuta, pendências, sumário, links cruzados e retorno à landing. Mantêm `robots=noindex` enquanto minutas. Publicação definitiva exige confirmar os itens abaixo, aprovar os textos, definir versão/data e decidir a retirada de `noindex`. Não há aceite obrigatório nem banner de cookies.

## Validação reproduzível

Os cenários estão em [legal.spec.ts](../../apps/web/e2e/legal.spec.ts). Após instalar as dependências e o navegador Chromium do Playwright, executar sequencialmente na raiz:

```sh
pnpm --filter @screen-room/signaling... build
pnpm --filter @screen-room/web exec playwright test e2e/legal.spec.ts --workers=1
```

A suíte cobre acesso direto/recarga, metadados, aviso de minuta, foco, âncoras, links, ausência de overflow em 1280, 768, 390 e 320 px e criação/ingresso em sala. Emulação não comprova leitores de tela ou dispositivos físicos; estes testes não validam conteúdo jurídico, produção pública, mídia nativa ou conectividade entre redes.

## Pendências antes de publicar

| Pendência | Decisão/informação necessária do proprietário |
| --- | --- |
| Responsável legal/controlador | Nome ou razão social, identificação e demais informações institucionais aplicáveis |
| Contatos | Canal oficial de suporte/abuso e canal de privacidade; encarregado quando aplicável; responsáveis pelo atendimento |
| Logs e retenção | Inventário real de logs de aplicação, console coletado, proxy, hospedagem e STUN/TURN; acesso, rotação, prazos, backups, eliminação e obrigações legais aplicáveis |
| Fornecedores | Lista efetiva, papéis, contratos e serviços habilitados, incluindo cookies/rastreamento adicionados em produção |
| Transferências internacionais | Países, destinatários e mecanismos/garantias aplicáveis |
| Bases legais | Confirmar matriz de finalidades e bases legais; necessidade/proporcionalidade, dados sensíveis, crianças e adolescentes e eventuais condições etárias |
| Direitos dos titulares | Processo seguro de identificação e atendimento, prazos aplicáveis, limitações e conservação legal |
| Revisão jurídica | Revisar ambas as minutas, deveres do serviço, termos de responsabilidade e legislação aplicável |
| Publicação | Aprovar textos finais, versão, data efetiva, comunicação de mudanças e retirada de `noindex` |


As pendências também aparecem nas páginas; não devem ser preenchidas com dados fictícios. O repositório não permite concluir quem opera efetivamente a infraestrutura ou seus prazos reais de retenção.

## Auditoria histórica

O [relatório original](https://github.com/aldomigge/webrtc-shared/blob/6089080f0966f69be4f39a484a68c2af4798c1fc/docs/legal/README.md) registra resultados e limitações da implementação de 22/10/2026. Os artefatos descartáveis foram retirados da árvore atual, com cópias físicas locais preservadas:

- [Medições de navegador](https://github.com/aldomigge/webrtc-shared/blob/6089080f0966f69be4f39a484a68c2af4798c1fc/docs/legal/browser-audit.json).
- [Achados do detector](https://github.com/aldomigge/webrtc-shared/blob/6089080f0966f69be4f39a484a68c2af4798c1fc/docs/legal/impeccable-findings.json).
- [Consistência visual](https://github.com/aldomigge/webrtc-shared/blob/6089080f0966f69be4f39a484a68c2af4798c1fc/docs/legal/design-consistency.md).
- [Revisão visual](https://github.com/aldomigge/webrtc-shared/blob/6089080f0966f69be4f39a484a68c2af4798c1fc/docs/legal/visual-review.md).

Capturas locais pertencem a `screenshots/legal/`, ignorado pelo Git. A limpeza documental não reexecutou os testes nem representa nova aprovação visual, jurídica ou de publicação.
