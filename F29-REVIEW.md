# F29 — revisão visual e contextual

PR: [#20](https://github.com/aldomigge/webrtc-shared/pull/20) · branch `feat/f29-follow-presenter` · referência anterior `61a9c6d`.

**Aprovação visual do proprietário: pendente.** Capturas e testes são evidência para revisão, não aprovação.

## Problemas e ajustes

- Indicador e ações permanentes competiam com a transmissão. A F29 agora tem um único controle contextual, com nome e estado sempre visíveis quando há acompanhamento configurado. Retomar, parar, indicar e escolher apresentador ficam no menu.
- A escolha direta de outro apresentador era bloqueada durante acompanhamento ativo. O menu lista os demais apresentadores com compartilhamento anunciado, inclusive pausado, sem exigir suspensão ou parada prévia.
- O estado ativo confundia configuração com disponibilidade. “Transmissão indisponível” identifica alvo encerrado, indicação limpa, ausência de compartilhamento ou anúncio sem tracks recebidas; “Aguardando reconexão” identifica desconexão local ou do apresentador. Suspensão manual continua preservada na reconexão. O último nome conhecido permanece visível durante a reserva.
- A indicação aparecia durante transições sem poder executar. Interface e callback usam a mesma regra de elegibilidade; o callback também revalida conexão, sala, captura e alvo no momento do clique. O servidor mantém a validação de remetente/alvo compartilhando e seu limite de frequência. Não houve mudança de protocolo.
- O feedback agora diz “Solicitação de indicação enviada.”: envio não confirma aceitação pelo servidor nem entrega aos seguidores. Falha de envio tem mensagem própria.
- Menu dentro do palco para funcionar em fullscreen; espaço reservado para chat/reações em Cinema e fullscreen estreitos; alvos de toque de pelo menos 44px; foco e navegação do menu por teclado. Medição da faixa de acompanhamento agendada no próximo frame para evitar notificações recursivas de ResizeObserver.

## Matriz de estados × ações

As ações abaixo ficam no menu **Acompanhamento**. “Outros” significa participantes remotos com compartilhamento anunciado, excluindo o apresentador já seguido. Seguir nunca é imposto automaticamente.

| Estado | Seguir / trocar | Retomar | Parar de seguir | Indicar aos seguidores | Indicador / validação |
| --- | --- | --- | --- | --- | --- |
| Sem compartilhamento e sem acompanhamento | Ausente | Ausente | Ausente | Ausente | Controle ausente; E2E desktop/320px |
| Prévia inicial / solicitação / publicação | Outros, se existentes e fora do modal | Só se suspenso e acessível fora do modal | Se configurado e acessível fora do modal | Ausente | E2E de prévia + matriz unitária de transições |
| Compartilhamento ativo conectado | Outros | Só se suspenso | Se configurado | Sim, com alvo válido no palco | Acompanhando se alvo disponível; E2E |
| Compartilhamento pausado conectado | Outros, inclusive pausados | Só se suspenso | Se configurado | Sim, com alvo válido no palco | Acompanhando; palco indica Pausado; E2E |
| Pausando / retomando / parando | Outros | Só se suspenso | Se configurado | Ausente | Matriz unitária de elegibilidade; ciclo de pausa/retomada E2E |
| F27: solicitando / prévia / publicando / restaurando | Outros, respeitando modal | Só se suspenso e acessível | Se configurado e acessível | Ausente | Identidade e acompanhamento preservados; solicitação/prévia/confirmação E2E + demais transições unitárias |
| Suspensão por seleção manual | Outros, sem exigir parada | Sim | Sim | Apenas se o próprio espectador também transmite e está elegível | Suspenso; E2E |
| Apresentador desconectado com reserva | Outros disponíveis | Após reconectar, se suspensão preservada | Sim | Apenas remetente conectado e elegível | Aguardando reconexão; nome preservado; E2E |
| Cliente desconectado / reconectando | Escolha local conforme participantes ainda conhecidos | Não enquanto aguarda conexão | Se configurado | Ausente | Aguardando reconexão; regra de execução unitária e reconexão E2E |
| Reconexão concluída | Outros | Se suspensão manual anterior | Se configurado | Só após sala pronta e captura estável | Snapshot reaplicado; suspensão preservada; E2E |
| Transmissão indicada encerrada / limpa / indisponível | Outros disponíveis | Só se suspenso | Sim | Só remetente elegível e novo alvo válido | Transmissão indisponível, mesmo com outra transmissão no palco; E2E |
| Apresentador encerrou captura mas permanece na sala | Outros disponíveis | Só se suspenso | Sim | Ausente para quem encerrou | Configuração mantida; sem transmissão indicada quando não há alvo; E2E |
| Palco vazio com acompanhamento configurado | Ausente sem outros compartilhamentos anunciados | Só se suspenso | Sim | Ausente | Transmissão indisponível; E2E desktop/375px/320px e Cinema |
| Compartilhamento anunciado, palco aguardando tracks | Pode configurar acompanhamento | Só se suspenso | Sim | Ausente sem alvo disponível no palco | Transmissão indisponível; E2E específico |
| Múltiplos apresentadores | Escolha direta de qualquer outro | Só se suspenso | Se configurado | Regra normal do remetente e alvo | Seguidores independentes; E2E |
| Saída voluntária / reserva expirada | Outros disponíveis | Ausente para acompanhamento encerrado | Ausente para acompanhamento encerrado | Regra normal | Acompanhamento encerrado; saída E2E, expiração unitária |

A matriz unitária cobre os 13 estados de captura e bloqueios por desconexão, sala não pronta, ausência de compartilhamento e troca pendente. Os E2E conferem listas completas de ações e ausência de ações indevidas, além da execução.

## Capturas reais do Chromium

Captura de mídia sintética por canvas, com participantes em contextos separados, aplicação web e signaling locais. As áreas vermelha/azul são a transmissão sintética.

| Viewport | Antes (`61a9c6d`) | Depois |
| --- | --- | --- |
| Desktop 1280×800, acompanhamento ativo | [Antes](screenshots/f29-review/before-desktop-active.png) | [Depois](screenshots/f29-review/after-desktop-active.png) |
| Mobile 375×700, acompanhamento ativo | [Antes](screenshots/f29-review/before-mobile-active.png) | [Depois](screenshots/f29-review/after-mobile-active.png) |
| Mobile 320×700 | — | [Ativo](screenshots/f29-review/after-mobile-320-active.png) · [Trocar apresentador](screenshots/f29-review/after-mobile-320-switch-menu.png) |
| Troca direta de apresentador | — | [Desktop](screenshots/f29-review/after-desktop-switch-menu.png) · [320px](screenshots/f29-review/after-mobile-320-switch-menu.png) |
| Suspenso | — | [Desktop](screenshots/f29-review/after-desktop-suspended.png) · [320px](screenshots/f29-review/after-mobile-320-suspended.png) |
| Reconectando | — | [Desktop](screenshots/f29-review/after-desktop-reconnecting.png) · [320px](screenshots/f29-review/after-mobile-320-reconnecting.png) |
| Anúncio sem mídia recebida | — | [Desktop](screenshots/f29-review/after-desktop-no-media.png) |
| Alvo indisponível | — | [Desktop](screenshots/f29-review/after-desktop-unavailable.png) · [320px](screenshots/f29-review/after-mobile-320-unavailable.png) |
| Palco vazio | — | [Desktop](screenshots/f29-review/after-desktop-empty.png) · [375px](screenshots/f29-review/after-mobile-empty.png) · [320px](screenshots/f29-review/after-mobile-320-empty.png) |
| Cinema | — | [Desktop](screenshots/f29-review/after-desktop-cinema.png) · [320px](screenshots/f29-review/after-mobile-320-cinema.png) |
| Fullscreen | — | [Desktop](screenshots/f29-review/after-desktop-fullscreen.png) · [320px](screenshots/f29-review/after-mobile-320-fullscreen.png) |
| Palco vazio em Cinema | — | [Desktop](screenshots/f29-review/after-desktop-empty-cinema.png) · [320px](screenshots/f29-review/after-mobile-320-empty-cinema.png) |

## Validação e limites

- `pnpm --filter @screen-room/signaling... build`: passou; preparou os builds usados pelos testes web.
- `pnpm test`: passou, 197 testes (13 protocol, 81 signaling, 103 web).
- `pnpm typecheck`: passou nos três pacotes.
- `pnpm build`: passou no workspace; bundler emitiu avisos sobre diretivas de módulos e nome de grupo de code splitting, sem impedir a compilação.
- `pnpm --filter @screen-room/web test:e2e follow.spec.ts sharing.spec.ts --workers=1`: 74/74 passaram (11 F29 + 63 compartilhamento).
- Após o ajuste final de disponibilidade de mídia, `pnpm typecheck` e `pnpm build` passaram novamente. A rodada ampliada da F29 passou em 11 cenários; o 12º acertou o indicador, mas falhou por esperar palco vazio em vez do placeholder “Conectando à transmissão”. A expectativa foi corrigida e esse caso foi reexecutado isoladamente (comando e resultado abaixo).
- `pnpm --filter @screen-room/web test:e2e follow.spec.ts --grep 'announced sharing' --workers=1`: passou (1/1). Os 12 cenários finais da F29 passaram, somando as execuções descritas acima.
- `git diff --check`: passou.

Nas execuções intermediárias dos novos testes, foram corrigidas esperas de animação do menu e uma simulação que também fechava o WebSocket do Vite, interrompendo a página. A simulação final fecha somente `/signal` e controla a tentativa de reconexão. Houve ainda uma falha de gravação de trace do Playwright (`file data stream has unexpected number of bytes` / arquivo ZIP truncado) em uma execução intermediária; não foi classificada como preexistente. Uma rodada posterior falhou em 320px porque o alerta produzido pela falha de socket deliberadamente simulada interceptava o toque; o teste passou a fechar esse alerta pela interface após reconectar. A mensagem sintética de anúncio também foi corrigida para incluir `audioMuted`, obrigatório no contrato. Execuções interrompidas para ajustar os testes não contam como validação aprovada.

A Impeccable local foi aplicada como refinamento da interface existente; detector sobre `FollowControls.tsx` e `RoomStage.tsx`: `[]`. Inspeção visual das capturas pelo agente, contraste dos textos sobre superfícies opacas escuras, foco visível e áreas efetivas de interação. Sem redesenho geral.

Captura sintética não valida permissões nativas, áudio real de aba/sistema, autoplay com áudio ou STUN/TURN entre redes distintas. Não foram usados dispositivos físicos nem leitores de tela. Chromium foi o navegador desta revisão; Firefox e Safari não foram executados.

## Arquivos alterados

- `apps/web/src/features/room/components/FollowControls.tsx`: controle contextual, menu, status e estilos da F29.
- `apps/web/src/features/room/components/RoomStage.tsx`: opções de apresentador, disponibilidade do alvo, identidade durante reconexão e limites de layout.
- `apps/web/src/features/room/hooks/follow-presenter.ts`: estado de apresentação indisponível e regra de elegibilidade de indicação.
- `apps/web/src/features/room/hooks/useRoomSession.ts`: integração das regras e feedback de envio.
- `apps/web/src/routes/room.$roomId.tsx`: passa a elegibilidade ao palco.
- `apps/web/test/follow-presenter.test.js`: matriz de elegibilidade e estados exibidos.
- `apps/web/e2e/follow.spec.ts`: ações presentes/ausentes, troca direta, transições, reconexão, zoom, Cinema/fullscreen, teclado, toque e capturas.
- `F29-REVIEW.md` e `screenshots/f29-review/*.png`: relatório e evidência visual desta revisão. Demais arquivos não rastreados preservados.
