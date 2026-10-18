# F29 — acompanhamento das escolhas do apresentador

PR: [#20](https://github.com/aldomigge/webrtc-shared/pull/20) · branch `feat/f29-follow-presenter`.

**Revisão técnica e aprovação visual do proprietário: pendentes.** Testes e inspeção pelo agente não substituem essas aprovações.

## Experiência final

O apresentador apenas escolhe uma transmissão no palco. Essa ação sincroniza automaticamente a escolha com quem decidiu acompanhá-lo. Não existe ativação pelo apresentador, gerenciamento de seguidores nem ação “Indicar aos seguidores”.

O espectador começa independente. Com duas ou mais transmissões anunciadas (incluindo pausadas), a gaveta **Participantes** oferece **Acompanhar escolhas de [nome]** junto aos apresentadores remotos. O apresentador seguido recebe uma identificação discreta e a ação **Parar de seguir**. A seleção manual de outra transmissão suspende o acompanhamento e disponibiliza **Retomar**. Trocar de apresentador é uma ação direta na mesma lista.

Com uma única transmissão e sem acompanhamento configurado, não há controles adicionais da F29. Se a quantidade cair, a configuração existente permanece acessível pela gaveta, inclusive para interromper o acompanhamento. Suspensão, reconexão e indisponibilidade aparecem somente para o acompanhamento configurado. O nome conhecido é preservado enquanto o apresentador está na reserva de reconexão.

O palco não contém controles nem indicadores permanentes da F29. Zoom e arraste continuam locais; Cinema, fullscreen, PiP e anotações usam os controles existentes.

## Implementação e invariantes

- `useRoomSession.ts`: a ação explícita de seleção manual publica `select-stage`. Recepção remota e fallback automático apenas atualizam o destaque local, sem publicar outra escolha; ciclos de acompanhamento não geram retransmissão em cadeia. A publicação inicial de captura registra o palco disponível naquele momento para o snapshot inicial. Retomar captura e trocar sua origem não republicam escolhas incidentais.
- `follow-presenter.ts`: mantém a máquina de acompanhamento opcional, suspensão manual, sequência por apresentador, fallback inicial, reserva e expiração. Mensagens obsoletas são ignoradas; seleções limpas não ressuscitam uma transmissão encerrada.
- `ParticipantsDrawer.tsx` e `room.$roomId.tsx`: concentram elegibilidade, estado e ações na lista existente, com botões de área efetiva mínima de 44px, quebra de texto e acesso por teclado/toque.
- `RoomStage.tsx`: remove a integração, estilos e medição da faixa de acompanhamento. `FollowControls.tsx` foi removido.
- `packages/protocol/src/messages.ts`, `apps/signaling/src/room-state.ts` e `server.ts`: `select-stage` / `stage-selected`, snapshot `selection` e nomes internos representam seleção, substituindo as estruturas de indicação manual. Mantidos os schemas estritos, identidade derivada do socket, remetente compartilhando, alvo ativo na mesma sala, limite de 5/s, sequência do servidor e invalidação de seleções nas reservas. Web, protocol e signaling precisam usar o mesmo contrato.
- Testes em `apps/web/test/follow-presenter.test.js`, `apps/signaling/test/stage-selection.test.js` e `apps/web/e2e/follow.spec.ts` foram atualizados para essa semântica.

Não houve alteração da captura de mídia, topologia mesh, transporte WebRTC ou credenciais. Sem alterações de F19, F20 ou GitHub Projects. Arquivos locais não rastreados foram preservados.

## Evidências visuais atuais

As capturas abaixo foram produzidas nesta revisão por Chromium real com mídia sintética e contextos separados. As evidências anteriores, produzidas até `eafe443`, mostram o fluxo substituído e **não descrevem a experiência final**. Somente as capturas listadas na tabela desta revisão devem ser usadas para avaliar a nova interface.

A matriz executada cobre sala com um participante, uma transmissão e espectadores, múltiplas transmissões, acompanhamento ativo/suspenso, reconexão, alvo indisponível, Cinema e fullscreen em 1280×800, 375×700 e 320×700. Os PNGs completos ficam nos artefatos locais do Playwright (`apps/web/test-results`); a seleção abaixo permanece acessível por permalinks do histórico Git após a remoção das evidências da árvore atual.

| Estado | Desktop 1280×800 | Mobile 375×700 | Mobile 320×700 |
| --- | --- | --- | --- |
| Um participante, sem transmissão | [Captura](https://github.com/aldomigge/webrtc-shared/blob/0f5208f7f70d5fdf00ed08c4dfd2378bd7dac1db/screenshots/f29-review/after-desktop-empty.png) | [Captura](https://github.com/aldomigge/webrtc-shared/blob/0f5208f7f70d5fdf00ed08c4dfd2378bd7dac1db/screenshots/f29-review/after-mobile-empty.png) | [Captura](https://github.com/aldomigge/webrtc-shared/blob/0f5208f7f70d5fdf00ed08c4dfd2378bd7dac1db/screenshots/f29-review/after-mobile-320-empty.png) |
| Acompanhamento ativo na gaveta | [Captura](https://github.com/aldomigge/webrtc-shared/blob/0f5208f7f70d5fdf00ed08c4dfd2378bd7dac1db/screenshots/f29-review/after-desktop-active.png) | [Captura](https://github.com/aldomigge/webrtc-shared/blob/0f5208f7f70d5fdf00ed08c4dfd2378bd7dac1db/screenshots/f29-review/after-mobile-active.png) | [Captura](https://github.com/aldomigge/webrtc-shared/blob/0f5208f7f70d5fdf00ed08c4dfd2378bd7dac1db/screenshots/f29-review/after-mobile-320-active.png) |
| Suspenso por escolha manual | [Captura](https://github.com/aldomigge/webrtc-shared/blob/0f5208f7f70d5fdf00ed08c4dfd2378bd7dac1db/screenshots/f29-review/after-desktop-suspended.png) | Artefato local | [Captura](https://github.com/aldomigge/webrtc-shared/blob/0f5208f7f70d5fdf00ed08c4dfd2378bd7dac1db/screenshots/f29-review/after-mobile-320-suspended.png) |
| Aguardando reconexão | [Captura](https://github.com/aldomigge/webrtc-shared/blob/0f5208f7f70d5fdf00ed08c4dfd2378bd7dac1db/screenshots/f29-review/after-desktop-reconnecting.png) | Artefato local | [Captura](https://github.com/aldomigge/webrtc-shared/blob/0f5208f7f70d5fdf00ed08c4dfd2378bd7dac1db/screenshots/f29-review/after-mobile-320-reconnecting.png) |
| Transmissão indisponível | [Captura](https://github.com/aldomigge/webrtc-shared/blob/0f5208f7f70d5fdf00ed08c4dfd2378bd7dac1db/screenshots/f29-review/after-desktop-unavailable.png) | Artefato local | [Captura](https://github.com/aldomigge/webrtc-shared/blob/0f5208f7f70d5fdf00ed08c4dfd2378bd7dac1db/screenshots/f29-review/after-mobile-320-unavailable.png) |
| Cinema, sem faixa de acompanhamento | [Captura](https://github.com/aldomigge/webrtc-shared/blob/0f5208f7f70d5fdf00ed08c4dfd2378bd7dac1db/screenshots/f29-review/after-desktop-cinema.png) | Artefato local | [Captura](https://github.com/aldomigge/webrtc-shared/blob/0f5208f7f70d5fdf00ed08c4dfd2378bd7dac1db/screenshots/f29-review/after-mobile-320-cinema.png) |
| Fullscreen, sem faixa de acompanhamento | [Captura](https://github.com/aldomigge/webrtc-shared/blob/0f5208f7f70d5fdf00ed08c4dfd2378bd7dac1db/screenshots/f29-review/after-desktop-fullscreen.png) | Artefato local | [Captura](https://github.com/aldomigge/webrtc-shared/blob/0f5208f7f70d5fdf00ed08c4dfd2378bd7dac1db/screenshots/f29-review/after-mobile-320-fullscreen.png) |

Uma transmissão com espectadores, gaveta sem controles extras e múltiplas transmissões também foram capturadas nos três tamanhos: arquivos `desktop-single.png`, `desktop-single-drawer.png`, `desktop-multiple.png` e equivalentes `mobile-*` / `mobile-320-*` nos resultados do teste “participants drawer”. Os testes anexam cada PNG ao resultado. Dez estados por viewport foram inspecionados em duas rodadas agrupadas pelo agente; a segunda confirmou a implementação final. Não foram adicionados novos PNGs versionados: 16 evidências existentes foram substituídas. Sete PNGs exclusivos do fluxo antigo foram removidos da árvore atual; continuam disponíveis no histórico até `eafe443`, sem serem apresentados como resultado final.

## Validação

- `pnpm --filter @screen-room/signaling... build`: passou; preparou protocol/signaling usados pelos testes web.
- `pnpm typecheck`: passou nos três pacotes, inclusive após o ajuste de elegibilidade.
- `pnpm test`: passou novamente na implementação final, **197/197** (13 protocol, 81 signaling, 103 web).
- `pnpm build`: passou novamente no workspace. O bundler emitiu avisos de diretivas de módulos e nome de grupo de code splitting; não impediram a compilação.
- `pnpm --filter @screen-room/web test:e2e follow.spec.ts sharing.spec.ts viewing-modes.spec.ts zoom.spec.ts --workers=1`: **75/77 passaram**: os 63 cenários de compartilhamento passaram; dois cenários de Cinema/PiP no demo falharam e foram corrigidos conforme descrito abaixo.
- `pnpm --filter @screen-room/web test:e2e follow.spec.ts viewing-modes.spec.ts zoom.spec.ts --workers=1`: **14/14 passaram** após a correção do demo (6 F29, 7 viewing modes, 1 zoom). Assim, os 77 cenários distintos passaram entre as execuções documentadas; não houve uma nova execução conjunta dos 77 após o ajuste exclusivo do demo.
- `git diff --check`: passou.

A matriz F29 inclui seguidores distintos, espectador independente, snapshot em entrada tardia, seleção inicial ao publicar, suspensão/retomada/troca/parada, ausência de retransmissão em cadeia, pausa, F27, queda do apresentador e do espectador, suspensão preservada, invalidação de alvo encerrado durante reserva e saída voluntária. A regressão amplia a cobertura de limpeza, compartilhamento, anotações, zoom, Cinema, fullscreen e PiP.

A Impeccable local foi usada como refinamento da gaveta existente. Detector sobre `ParticipantsDrawer.tsx` e `RoomStage.tsx`: `[]`. A aprovação visual continua pendente.

Preparação: um primeiro typecheck encontrou os builds antigos do protocolo após a renomeação do contrato. A reconstrução de protocol/signaling resolveu isso; o typecheck final passou.

Execuções intermediárias: o primeiro E2E usava um seletor com “Você” em vez de “você” e media a gaveta antes de terminar sua animação. O seletor e a espera pela posição final foram corrigidos. A primeira rodada completa dos cinco novos cenários passou em 5/5. Uma rodada ampliada foi interrompida para corrigir o bloqueio herdado de seleção durante F27; a execução final inclui um sexto cenário específico para seleção manual durante autorização pendente e pausa. Na primeira rodada, houve também edição de fonte, provocando HMR e interrupção de sessões; ela foi descartada como validação final. Essas falhas não são classificadas como preexistentes.

Na rodada ampliada, o guard de seleção da F29 rejeitou os participantes sintéticos fornecidos pela rota em `demo=multi`, impedindo a troca do palco e a saída de PiP em dois testes de Cinema (desktop/mobile). A seleção local foi preservada explicitamente quando `enabled=false`; o caminho da sala real continua validando participantes antes de publicar. Typecheck, build e os 197 testes foram reexecutados após essa correção. Os 63 testes de compartilhamento da rodada ampliada não foram repetidos, pois esse ajuste se limita ao caminho com a sessão desativada. A reexecução de F29, viewing modes e zoom valida o ajuste e a continuidade do caminho real.

Captura sintética não valida permissões nativas, áudio real de aba/sistema, autoplay com áudio ou STUN/TURN entre redes distintas. PiP usa mocks da API nos testes existentes; não comprova a janela nativa do sistema. Sem dispositivos físicos, leitores de tela, Firefox ou Safari nesta revisão.

## Correção pontual — consolidação de escolhas rápidas

Referência revisada: `236369d5e9b6a7896a442fe2764e94fcdd980656`.

- `stage-selection-publisher.ts` mantém somente a última intenção local e um timer. Todas as publicações locais (inclusive a seleção inicial ao iniciar captura) compartilham o intervalo mínimo de 1,1 segundo entre tentativas. A primeira tentativa pode ser imediata; novas escolhas substituem a pendência sem adiar indefinidamente seu envio.
- O evento existente `stage-selected` do próprio apresentador confirma a aceitação. Enquanto não houver confirmação, o timer tenta novamente a escolha mais recente ainda válida; após confirmar, não há reenvios periódicos. Sequências obsoletas não confirmam uma escolha mais nova. Um eco atrasado de outra escolha também é corrigido pela última intenção local.
- `useRoomSession.ts` cancela timer e intenção ao parar captura, perder conexão ou encerrar/mudar sessão. O intervalo de segurança permanece entre parada/reinício na mesma sala. Destinos que encerram ou saem são invalidados imediatamente, antes de eventual reinício do mesmo peer; remetente, sala e destino são revalidados antes de cada tentativa. Pausa e F27 com captura ainda anunciada mantêm a escolha válida.
- Atualizações remotas do acompanhamento e fallback continuam sem passar pelo publicador. Somente ecos do próprio apresentador entram na confirmação. O servidor e seu limite de cinco eventos por segundo, o protocolo e a interface permanecem inalterados.
- `stage-selection-publisher.test.js`: consolidação de cem alterações, confirmação e eventos atrasados, retorno a uma escolha com outra em trânsito, cancelamento/invalidação, falha de transporte, parada/reinício e troca de sessão. Integração com `RoomRegistry` e reducer do seguidor satura o limite real e comprova recuperação da escolha final após descarte silencioso.
- `follow.spec.ts`: novos E2E desktop/320px saturam o limite pela conexão real, alternam dezenove destaques em menos de um segundo e verificam a convergência final no seguidor, o espaçamento das tentativas e a ausência de reenvios após confirmação. A rajada usa cliques DOM programáticos; os cenários existentes de teclado/toque permanecem na suíte.

Validação desta correção: `pnpm test` passou em **210/210** (13 protocol, 81 signaling, 116 web); `pnpm typecheck` e `pnpm build` passaram. `pnpm --filter @screen-room/web test:e2e follow.spec.ts sharing.spec.ts --workers=1`: **70/71 passaram**, incluindo os oito F29 e os dois novos testes de rajada. O caso “F13 laser, geometry, immediate drawing, expiry, clear, late join and reconnect without history” falhou com `Execution context was destroyed` durante a simulação de reconexão. O trace registra o fechamento do socket do Vite pela simulação que fecha todos os sockets, seguido da mensagem `[vite] server connection lost`. Não foi classificado como preexistente.

`pnpm --filter @screen-room/web test:e2e sharing.spec.ts --grep 'F13 laser, geometry' --workers=1 --output=/tmp/f29-consolidation-f13-recheck`: **1/1 passou**, em 14,7s, sem alterar código ou o teste F13. Portanto, os 71 cenários distintos passaram entre as duas execuções; não houve uma segunda rodada conjunta dos 71. A intermitência da simulação permanece registrada, sem mudança de F13 fora do escopo. `git diff --check` passou. Na preparação foram corrigidas a sintaxe do construtor para o strip-only do Node 22 e a declaração `override` da instrumentação E2E; as verificações finais citadas passaram após esses ajustes.

Sem nova revisão visual ou capturas versionadas: não há alteração de interface. Permanecem as limitações de mídia sintética e a aprovação visual pendente descritas acima.
