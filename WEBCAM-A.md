# Infraestrutura de câmera — Etapa A

A aplicação não captura câmera e não publica essa fonte no fluxo normal. Os únicos
produtores novos são testes sintéticos. Não há controles ou mudanças no palco.

## Contratos internos

- `PeerManager.attachCameraStream(stream)` publica exatamente uma track de vídeo,
  sem áudio, nos peers existentes. Novos peers e conexões recriadas recebem a
  fonte atual. A chamada não captura mídia nem anuncia disponibilidade.
- `detachCameraStream()` desanexa apenas a câmera, preservando sua captura e os
  senders de tela. `stopCamera()` também encerra a track. `dispose()` encerra a
  câmera anexada. Operações pendentes são invalidadas por versão.
- `detachLocalStream()` continua limitado à tela e seu áudio. Assim, troca de
  origem pode manter a câmera. Pausa explícita, encerramento da apresentação e
  desconexão da sinalização encerram a câmera; reconexão exige nova publicação.
- `onRemoteCameraStream(peerId, stream | null)` é independente do callback de
  tela. O `peerId` identifica o apresentador. `setRemoteCamera()` controla sua
  disponibilidade; o stream principal contém exclusivamente tela e áudio dela.
- A próxima etapa deve validar elegibilidade local e anunciar `update-camera`
  somente após publicação bem-sucedida; deve desanexar/encerrar a câmera e anunciar
  `active: false` ao desligar ou ao falhar. Falhas dessa fonte não devem chamar o
  encerramento do compartilhamento de tela.

## Sinalização e identificação

`update-camera { active }` e `camera-updated { peerId, active }` são separados de
`update-sharing`. O servidor limita `active: true` a participantes com apresentação
ativa. `sharing.paused` não invalida a câmera, pois também representa troca de
origem. Encerrar a apresentação limpa e anuncia o estado de câmera. O snapshot
`peers.participants[].camera` informa entrada tardia. Estado de câmera não é
preservado em reservas nem em substituição de socket.

Ofertas e respostas transportam `sources: [{ mid, source }]`, com fontes
`screen-video`, `screen-audio` e `camera-video`. O mapa é validado, sem duplicar
fontes ou mids, e instalado dentro da fila de sinalização, somente para descrições
aceitas pelos controles existentes de negociação e geração. Uma falha de aplicação
da descrição restaura o mapa anterior. A identificação usa o transceiver do evento,
sem depender da ordem de chegada nem do stream informado pelo navegador. Mapas
explícitos com fonte desconhecida são descartados. Mensagens legadas sem mapa
mantêm suporte a tela única; não podem identificar câmera.

Estatísticas selecionam tela por `mid` ou `trackIdentifier`, vinculando a perda
remota ao `localId` do relatório de saída escolhido. Com múltiplos vídeos sem
identificação suficiente, a amostra é indisponível para adaptação, em vez de
atribuir perdas da câmera à tela. Os critérios e janelas F34 permanecem iguais.
Nenhum algoritmo de adaptação de câmera foi adicionado.

## Limites da validação

Mocks e canvas no Chromium verificam fontes independentes, negociação, entrada
tardia e recriação de conexões. Não comprovam câmera física, permissões nativas,
áudio real, comportamento de outros navegadores ou redes distintas com TURN.
A captura, qualidade inicial da câmera e UI permanecem para a Etapa B.

## Arquivos da etapa

- `packages/protocol/src/messages.ts`: disponibilidade e mapa de fontes.
- `apps/signaling/src/room-state.ts` e `server.ts`: elegibilidade, snapshot e eventos.
- `apps/web/src/features/room/webrtc/peer-manager.ts`: senders, recepção e negociação.
- `apps/web/src/features/room/stats/stats-collector.ts`: seleção do RTP de tela.
- `apps/web/src/features/room/signaling/signaling-client.ts` e
  `hooks/useRoomSession.ts`: envio e consumo do estado; limpeza de câmera.
- `packages/protocol/test/camera.test.js`,
  `apps/signaling/test/room-state.test.js` e `signaling.test.js`,
  `apps/web/test/peer-manager.test.js` e `stats-collector.test.js`,
  `apps/web/e2e/camera-infrastructure.spec.ts`: validação dos contratos e cenários.
- `WEBCAM-A.md`: contrato de integração e registro de validação.

## Registro de E2E

Rodada final no Chromium: **9/9 aprovados**. Comando:

```sh
pnpm --filter @screen-room/web test:e2e --grep 'camera infrastructure|concurrent presenters keep|F34|F27 detach barrier|spectator and presenter recover|simultaneous initial offers|participants enter before capture|F27 first audio'
```

Inclui dez ciclos de compartilhamento, ofertas simultâneas, áudio adicionado após
tela, reconexão, troca de origem, câmera independente, múltiplos apresentadores,
entrada tardia e F34 em 1280px/390px.

O cenário `late join and a presenter serving nine spectators` falhou nas duas
rodadas executadas com a alteração e também com os fontes do HEAD
`2e91801f9e785e94a3bc5e32ccffb7e660016afb`, no mesmo workspace e ambiente.
A comparação restaurou os fontes e recompilou protocol/signaling antes de cada
versão. Essa falha de reprodução/negociação permanece sem diagnóstico conclusivo.
Não foi alterado o teste nem ampliado seu timeout.

F27 e F34 mobile tiveram timeouts em rodadas intermediárias e passaram na rodada
final; não se atribui a causa dessas ocorrências ao código anterior sem evidência
adicional. Uma tentativa inicial de comparação em cópia temporária foi inválida
por falha de inicialização do Nitro; os resultados comparativos acima usam a
execução posterior no workspace original.

Não foi executada a suíte E2E completa, nem validado Firefox ou câmera física.
Ao encerrar a implementação local, ainda não havia commit, push, PR, merge,
deploy ou atualização remota. A publicação para revisão foi autorizada em handoff
posterior, na branch `feat/webcam-a-transport`, com PR draft contra `main`.

Demais verificações concluídas:

| Comando | Resultado |
| --- | --- |
| `pnpm --filter @screen-room/signaling... build` | Aprovado; repetido após restaurar a comparação |
| `pnpm typecheck` | Aprovado |
| `pnpm test` | 404 testes aprovados: protocol 21, signaling 128, web 255 |
| `pnpm build` | Aprovado; workspace completo |
| `git diff --check` | Aprovado |

Logs locais da execução: `/tmp/webcam-final-types.log`,
`/tmp/webcam-final-test2.log`, `/tmp/webcam-final-build.log`,
`/tmp/webcam-final-e2e.log` e `/tmp/webcam-baseline-real.log`.

A implementação local foi concluída na `main`, no HEAD de referência acima.
Nenhuma decisão adicional de produto é necessária para integrar estes contratos. A Etapa B precisa de sua
própria autorização e deverá implementar captura sem microfone, elegibilidade,
publicação manual, tratamento isolado de falhas e limites iniciais de qualidade.
