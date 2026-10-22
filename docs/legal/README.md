# Termos de Uso e Política de Privacidade — minutas para revisão

Revisão: 22/10/2026. Versão documental: **0.1 — minuta**. Sem data de publicação ou vigência definida. Não constitui parecer ou certificação de conformidade jurídica.

Base inicial: branch `main`, HEAD `83203d8156afe6768eafcfb44722386cf514a7ed`. A validação local descrita abaixo foi concluída antes do commit e da abertura do PR. O handoff posterior autoriza branch dedicada, commit, push e PR draft contra `main`, exclusivamente para revisão técnica e documental. Merge, deploy e conversão para ready for review permanecem não autorizados. Diretórios preexistentes `.agent/`, `.impeccable/` e `apps/web/.impeccable/` preservados.

## Implementação

- `/termos`: apresentação, participação, responsabilidades, compartilhamento, clipes/consentimento, arquivos/Watch Party, direitos autorais, condutas, moderação, disponibilidade, responsabilidades legais e atualizações/contato.
- `/privacidade`: dados, finalidades/bases legais propostas para revisão, armazenamento no navegador, conectividade, conteúdos, memória/logs, retenção, terceiros, segurança, direitos e atualizações.
- Ambas têm sumário por âncoras, um H1, seções H2, link para o outro documento, retorno à landing, versão e data de revisão. Aviso de minuta e pendências são visíveis. Não há aceite obrigatório, banner de cookies ou datas fictícias de publicação.
- Metadados de título e descrição específicos; `robots=noindex` enquanto minutas. Antes da publicação definitiva, decidir a retirada dessa diretiva.
- Rodapé da landing inclui Termos e Privacidade. Acesso nas salas foi avaliado e não adicionado: a landing oferece acesso público sem ocupar controles nem induzir saída da sessão ativa.
- Árvore de rotas atualizada pelo gerador TanStack durante `pnpm build`, nunca editada manualmente. Sem novas dependências, alterações de infraestrutura ou dos mecanismos de sala/mídia.

## Arquivos

| Arquivo | Finalidade |
| --- | --- |
| `apps/web/src/features/legal/documents.ts` | Minutas integrais e versão/data |
| `apps/web/src/features/legal/LegalPage.tsx` | Estrutura acessível compartilhada |
| `apps/web/src/features/legal/LegalPage.module.css` | Leitura e responsividade |
| `apps/web/src/routes/termos.tsx` | Rota e metadados |
| `apps/web/src/routes/privacidade.tsx` | Rota e metadados |
| `apps/web/src/routes/index.tsx` | Links no rodapé |
| `apps/web/src/routes/index.module.css` | Agrupamento e quebra dos links |
| `apps/web/src/routeTree.gen.ts` | Registro gerado das rotas |
| `apps/web/e2e/legal.spec.ts` | Navegação, recarga, tamanhos e criação/ingresso |
| `docs/legal/README.md` | Relatório e pendências |
| `docs/legal/browser-audit.json` | Medições de navegador no build de produção |
| `docs/legal/impeccable-findings.json` | Saída do detector, caminhos relativos |
| `docs/legal/visual-review.md` | Parecer visual independente |
| `docs/legal/design-consistency.md` | Comparação com a identidade existente |

As minutas editáveis são os objetos `terms` e `privacy` em `documents.ts`, renderizados sem transformação do conteúdo. Evidências raster ficam em `screenshots/legal/`, diretório ignorado pelo Git; são artefatos locais, não assets da aplicação, e não acompanham o PR. Os relatórios textuais e JSON nesta pasta registram a evidência disponível para revisão; as capturas podem ser reproduzidas pelo teste E2E indicado abaixo.

## Investigação e fontes

Consulta orientada pelo `AGENTS.md`, `README.md`, manifests, `DEPLOY.md`, `TURN.md`, tema, root e router da web. Fontes técnicas verificadas:

| Tratamento | Evidência no repositório |
| --- | --- |
| Nickname e dados por aba/sala | `routes/index.tsx`, `routes/room.$roomId.tsx`, `hooks/useRoomSession.ts`, `signaling/room-session-storage.ts` |
| Preferência persistente de atalhos | `hooks/useRoomShortcuts.ts` |
| Captura exclusivamente de tela/áudio | `media/display-media.ts` |
| Gravador local, limites e limpeza | `media/local-clip.ts`, `apps/signaling/src/clips.ts` |
| Arquivos, aceite e metadados | `files/file-transfer-manager.ts`, `apps/signaling/src/file-transfers.ts`, schemas de protocolo |
| Vídeos locais e coordenação | `watch/prepare-video.ts`, `apps/signaling/src/watch-party.ts` |
| WebSocket, IPs, logs, chat e colaboração | `apps/signaling/src/server.ts`, `proxy.ts`, `key-rate-limiter.ts`, `room-state.ts`, `packages/protocol/src/messages.ts` |
| Memória e reconexão padrão de 30 segundos | `apps/signaling/src/room-state.ts` (não equivale a retenção de logs) |
| Diagnósticos recentes e console | `diagnostics/diagnostics-logger.ts` (padrão 50 entradas em memória, também escreve no console) |
| STUN/TURN e fallback Google/Twilio | `webrtc/ice-config.ts`, `apps/signaling/src/turn.ts`, `TURN.md` |

Caminhos abreviados da web são relativos a `apps/web/src/features/room/`, salvo as rotas. Busca por armazenamento, cookies, rastreamento e endpoints em fontes e arquivos públicos não identificou analytics, pixels, IndexedDB ou service worker. O resultado se limita ao código examinado; não comprova ausência de registros/cookies em proxy, hospedagem ou fornecedores de produção. Não foram lidos segredos de ambiente ou coletadas credenciais reais.

As referências [Termos fornecidos](https://www.janja.live/termos) e [Privacidade fornecida](https://www.janja.live/privacidade) foram consultadas pela ferramenta web em 22/10/2026; ambas retornaram indisponibilidade nessa ferramenta. Isso não comprova indisponibilidade global dos sites. **Nenhum trecho foi reaproveitado.** Os textos são originais, baseados nas evidências locais.

Consultado o texto oficial da [LGPD — Lei 13.709/2018](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm), especialmente finalidades/bases legais, direitos dos titulares, segurança e transferência internacional. As bases legais na minuta são hipóteses a confirmar por tratamento, não conclusões validadas. Não houve reprodução de conteúdo jurídico de outros serviços.

## Validação técnica

Ambiente: Node.js 22.23.3, pnpm 12.6.0; Chromium Playwright local.

| Verificação | Resultado |
| --- | --- |
| `pnpm build` | Passou, incluindo geração de rotas e build SSR |
| `pnpm typecheck` | Passou nos três pacotes |
| `pnpm test` | Passou: protocol 20, signaling 126, web 250; total 396, zero falhas |
| `pnpm --filter @screen-room/web exec playwright test e2e/legal.spec.ts --workers=1` | 5 testes passaram |
| `git diff --check` | Passou |
| Build de produção iniciado com `PORT=4321 HOST=127.0.0.1 node apps/web/.output/server/index.mjs` | HTTP 200, H1 no HTML do servidor, recarga e metadados das duas rotas verificados em Chromium |

Os quatro testes parametrizados verificam 1280, 768, 390 e 320 px (altura 900), acesso direto, recarga, título/descrição/noindex, aviso de minuta, foco por Tab, skip link por Enter, âncoras por clique/toque emulado, links cruzados, retorno à landing, links do rodapé e ausência de overflow dos elementos do documento. Coletam exceções da página e erros de console; nenhum observado nos fluxos das páginas. O quinto testa criação pela landing e ingresso por código em um segundo contexto, com confirmação de dois participantes nos dois clientes.

Durante o desenvolvimento do teste ocorreram falhas por seleção ambígua de controles repetidos, troca de DOM durante navegação e clique no HTML antes da hidratação da landing. Foram corrigidas no teste (escopo do banner, espera pela landing e mesma espera de hidratação já usada pelos E2E existentes). Não são classificadas como falhas preexistentes da aplicação; não exigiram alteração funcional da landing. A execução final passou.

Build emitiu diagnósticos de diretivas de módulos ignoradas em dependências; Playwright/Node informaram conflito entre `NO_COLOR` e `FORCE_COLOR`. Ambos os comandos concluíram com sucesso.

## Validação visual e acessibilidade

A skill Impeccable foi aplicada com contexto, referências de composição/leitura e craft floor, detector e revisão independente. A revisão concluiu **`ship` exclusivamente para a apresentação visual da minuta local**; não significa aprovação jurídica ou autorização de publicação.

Foram inspecionadas 20 imagens: oito páginas completas, oito primeiras dobras e quatro recortes de rodapé, cobrindo todos os tamanhos. Primeiras capturas do rodapé tinham espaço em branco do conteúdo da landing com revelação por scroll; foram substituídas por capturas do elemento efetivamente modificado. Não houve mudança visual fora do escopo.

- `screenshots/legal/termos-{1280,768,390,320}.png`
- `screenshots/legal/privacidade-{1280,768,390,320}.png`
- `screenshots/legal/termos-{1280,768,390,320}-top.png`
- `screenshots/legal/privacidade-{1280,768,390,320}-top.png`
- `screenshots/legal/landing-{1280,768,390,320}.png`

`browser-audit.json` registra oito combinações de documento/tamanho no build de produção: sem overflow horizontal, contraste mínimo **9,23:1** nos textos/links selecionados, corpo de 16 px com entrelinha de 28,8 px, foco visível e links de navegação medidos com altura mínima de **44 px**. A altura de interação inclui padding/caixa flex e não corresponde apenas à altura visual das letras. Não foi executada auditoria automatizada completa de acessibilidade.

O detector retornou 51 achados consultivos: oito relativos a tamanhos tipográficos/cor no CSS novo, 43 relativos a declarações existentes da landing que não foram introduzidas nesta tarefa. Não houve achados bloqueantes. Os tamanhos do documento são adaptações locais para leitura e preservam a fonte e paleta existentes. O contexto alertou sobre sidecar de design desatualizado e documentação de produto ainda referindo F14; não foram reparados por estarem fora do escopo.

Não foram testados leitores de tela, dispositivos de toque físicos, Safari, Firefox, produção pública, permissões nativas, áudio real, gravação, transferência de arquivos ou conectividade STUN/TURN entre redes distintas. A suíte completa de E2E de compartilhamento não foi executada; não houve alterações no ciclo de mídia. O smoke test de sala valida criação/ingresso local, não todos os recursos da sala.

## Confirmações obrigatórias antes de publicar

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

As pendências também aparecem nas páginas; não foram preenchidas com dados fictícios. O repositório não permite concluir quem opera efetivamente a infraestrutura ou seus prazos de retenção. A publicação na branch `feat/legal-terms-privacy` e em PR draft destina-se somente à revisão. Não publica os documentos no serviço, não lhes atribui vigência e não substitui a aprovação do proprietário nem a revisão jurídica.

## Preparação para revisão no GitHub

A inspeção prévia ao commit confirmou que `origin/main` e a base local apontavam para `83203d8156afe6768eafcfb44722386cf514a7ed`. Foram conferidos o diff completo, o registro gerado das rotas, a identificação de minuta, as pendências e a ausência de contatos inventados ou segredos nos arquivos selecionados. Os resultados de build, tipos, testes e revisão visual acima pertencem à execução local anterior; não foram repetidos integralmente nesta preparação, pois não houve alteração funcional. As únicas adaptações posteriores foram documentais, para registrar a autorização de revisão e usar referências versionadas em vez de arquivos temporários.
