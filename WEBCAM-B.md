# Webcam opcional — Etapa B

Base: `main`, `d452cf24b8b2bdbd576fd78346f78ac379c17e6b`.
Contratos de transporte e identificação: [WEBCAM-A.md](WEBCAM-A.md).

## Comportamento

O apresentador ativa a câmera no Floating Control Dock durante a transmissão de
uma tela. A ação chama `getUserMedia()` com `audio: false`, vídeo de até 640×360
e 15 FPS. A prévia fica somente no dispositivo local; apenas **Transmitir câmera**
anexa a track aos peers. O estado anunciado significa publicação local, não
confirmação de entrega a todos os destinatários. A composição no palco continua
fora desta etapa e essa limitação aparece na prévia.

O controlador de captura possui uma geração própria. Cancelamento, pausa,
encerramento da tela, desconexão e saída invalidam tanto a autorização quanto a
publicação pendentes. Uma autorização tardia encerra suas próprias tracks, sem
alterar uma captura mais recente. Track encerrada e falhas liberam a câmera,
anunciam disponibilidade falsa e exigem nova ação manual. Não há reativação ao
entrar, reconectar ou retomar a tela.

Trocar a origem desanexa somente a tela: câmera e indicação de câmera ao vivo
permanecem durante seleção, prévia, confirmação e restauração por cancelamento.
Se a tela anterior terminar nativamente durante a seleção, a câmera é desligada
imediatamente; a seleção de uma nova tela pode continuar sem ela.

Os senders de câmera recebem `maxBitrate: 400_000` e `maxFramerate: 15`,
independentemente da qualidade da tela. O limite é reaplicado na negociação,
incluindo novos peers e conexões recriadas. Encodings inicialmente ausentes podem
aguardar a descrição local; se continuarem indisponíveis após ela, ou se a
configuração falhar, a câmera é encerrada sem abortar a negociação da tela.
Resultados de configuração obsoletos não encerram uma câmera nova. Os mapas de
fontes por `mid` e a seleção de estatísticas F34 permanecem separados.

## Interface, acessibilidade e privacidade

A câmera usa o padrão de botão circular do dock, sem mover controles ao header.
Há estados desligado, solicitando permissão, prévia, publicando, ao vivo e erro.
A indicação de câmera ao vivo fica acima do dock mesmo quando recolhido e também
na prévia de troca de tela. O dock permite quebra de linha quando necessário em
320px com áudio de tela. A prévia usa modal com foco contido, Escape/cancelamento,
retorno de foco e foco inicial em Cancelar. Confirmar e cancelar têm altura de
44px; o novo ícone tem 18px, com a área de interação do padrão existente do dock:
42×42px, ou 40×42px em até 360px.

Os textos da página inicial, os termos, a política de privacidade e o README
foram ajustados para descrever a câmera opcional e sua confirmação. Microfone
continua ausente. Não foram alteradas bases legais, retenção, fornecedores ou
outras decisões jurídicas da minuta existente. Captura de tela, clipes, imagens
e PiP continuam usando apenas a fonte de tela.

## Evidências visuais

Chromium com captura sintética; não representam câmera física:

| Estado | Desktop 1280×800 | Mobile 390×844 |
| --- | --- | --- |
| Prévia local | [Imagem](https://github.com/aldomigge/webrtc-shared/blob/6089080f0966f69be4f39a484a68c2af4798c1fc/docs/webcam-b/camera-preview.png) | [Imagem](https://github.com/aldomigge/webrtc-shared/blob/6089080f0966f69be4f39a484a68c2af4798c1fc/docs/webcam-b/mobile-preview.png) |
| Câmera ao vivo | [Imagem](https://github.com/aldomigge/webrtc-shared/blob/6089080f0966f69be4f39a484a68c2af4798c1fc/docs/webcam-b/camera-live.png) | [Imagem](https://github.com/aldomigge/webrtc-shared/blob/6089080f0966f69be4f39a484a68c2af4798c1fc/docs/webcam-b/mobile-live.png) |
| Troca de origem com câmera ativa | [Imagem](https://github.com/aldomigge/webrtc-shared/blob/6089080f0966f69be4f39a484a68c2af4798c1fc/docs/webcam-b/camera-switch.png) | [Imagem](https://github.com/aldomigge/webrtc-shared/blob/6089080f0966f69be4f39a484a68c2af4798c1fc/docs/webcam-b/mobile-switch.png) |

[Dock de 320×740 com áudio de tela e interação por toque](https://github.com/aldomigge/webrtc-shared/blob/6089080f0966f69be4f39a484a68c2af4798c1fc/docs/webcam-b/mobile-audio-320.png).
Os testes verificam teclado, foco inicial/retornado, confirmação, cancelamento,
toque, ausência de overflow e independência do áudio da tela.

## Arquivos

- `apps/web/src/features/room/media/camera-controller.ts`: captura e controle de gerações.
- `apps/web/src/features/room/hooks/useRoomSession.ts`: elegibilidade, sinalização e ciclo da sessão/tela.
- `apps/web/src/features/room/webrtc/peer-manager.ts`: limites independentes dos senders e falhas isoladas.
- `apps/web/src/features/room/components/CameraControl.tsx`: ativação, prévia e confirmação.
- `apps/web/src/features/room/components/FloatingControlDock.tsx`: controle e indicação persistente.
- `apps/web/src/features/room/components/CapturePreview.tsx`: câmera ao vivo durante troca de tela.
- `apps/web/src/routes/room.$roomId.tsx`: integração dos controles.
- `apps/web/src/routes/index.tsx`, `features/legal/documents.ts`, `media/display-media.ts` e `README.md`: textos compatíveis com a captura opcional.
- `apps/web/test/camera-controller.test.js`, `peer-manager.test.js` e `apps/web/e2e/camera-capture.spec.ts`: regressões.
- `WEBCAM-B.md` e evidências históricas vinculadas acima: registro e capturas fora da árvore atual.

## Validação

O registro final de comandos e limitações está abaixo. Não foi executada a suíte
E2E inteira; o cenário de nove espectadores registrado na Etapa A não foi
reexecutado nesta etapa.

| Comando | Resultado |
| --- | --- |
| `pnpm --filter @screen-room/signaling... build` | Aprovado; prepara os builds compartilhados |
| `pnpm typecheck` | Aprovado |
| `pnpm test` | 430 aprovados: protocol 21, signaling 128, web 281 |
| `pnpm build` | Aprovado; workspace completo |
| E2E Chromium de regressão abaixo | 17/17 aprovados |
| `pnpm --filter @screen-room/web test:e2e --grep 'webcam B:' --workers=1` | 7/7 aprovados após separar o cenário de encerramento nativo |
| `E2E_BROWSER=firefox pnpm --filter @screen-room/web test:e2e --grep 'webcam B:' --workers=1` | 6 aprovados, 1 skip explícito: eventos `ended` artificiais ignorados pelo Gecko |
| `git diff --check` | Aprovado |

Comando da rodada de regressão Chromium (antes da separação do cenário nativo,
que apenas reorganizou os novos testes):

```sh
pnpm --filter @screen-room/web test:e2e --grep 'webcam B:|camera infrastructure|concurrent presenters keep|camera-only source switch|F34|F27 detach barrier|spectator and presenter recover|simultaneous initial offers|participants enter before capture|F27 first audio' --workers=1
```

As rodadas se sobrepõem; os números não devem ser somados como casos distintos.
Incluem início/parada/reinício, ofertas simultâneas, entrada tardia, múltiplos
apresentadores, recriação de conexões, troca confirmada/cancelada, F27 e F34.
O conjunto final de webcam inclui permissão negada/dispositivo ausente/ocupado,
prévia sem sender, confirmação e cancelamento, falha de publicação, queda da
sinalização, saída durante autorização pendente e encerramento das tracks.
Testes unitários adicionais cobrem publicação pendente, duplicação de ações,
resultados tardios, falha de anúncio e falha obsoleta de parâmetros do sender.

### Ocorrências intermediárias

- Uma rodada unitária teve `Missing room-state` em F11 (`an unclaimed creation
  occupied by guests expires without destroying their room`). Repetições completas
  passaram. Sem diagnóstico ou comparação suficiente para classificá-la como
  preexistente.
- Rodadas E2E intermediárias tiveram falhas no F34 desktop (sessão encerrada) e no
  F27. Uma rodada sofreu edição de fontes com Vite/HMR ativo e não foi usada como
  validação final. A rodada final de regressão, sem alterações durante a execução,
  passou em 17/17; não se atribuem essas ocorrências ao código anterior.
- O teste novo de queda inicialmente usava fechamento voluntário de socket;
  foi corrigido para interrupção com código 4001. Os primeiros testes também
  tinham seletor ambíguo e sincronização de foco insuficiente; foram corrigidos.
- A primeira rodada Firefox falhou em quatro testes compostos no trecho de
  `ended` sintético. O cenário nativo foi isolado com skip explícito nesse
  navegador, seguindo a limitação já registrada nos testes existentes. Os seis
  demais testes passaram, inclusive prévia, publicação, limites do sender, entrada
  tardia, troca, pausa, desconexão, falhas, saída pendente e toque.

Logs locais: `/tmp/webcam-b-types-final.log`, `/tmp/webcam-b-test-publish.log`,
`/tmp/webcam-b-build-final.log`, `/tmp/webcam-b-e2e-complete.log`,
`/tmp/webcam-b-chromium-final.log` e `/tmp/webcam-b-firefox-final.log`.

### Limitações e revisão pendente

Não houve validação de câmera física, permissões nativas, revogação real de
permissão, captura de áudio real, autoplay real, Safari/WebKit ou conectividade
entre redes distintas com STUN/TURN. Chromium e Firefox utilizaram vídeo de canvas
e, no teste de áudio, áudio sintético; viewport mobile e toque são emulação em
navegadores desktop. O encerramento nativo no Firefox continua exigindo verificação
física. Não há promessa de entrega da câmera a todos os peers nem composição no
palco, PiP, screenshots ou clipes. Suspensão automática D8 permanece fora do escopo.

O PR deve permanecer draft para revisão técnica e visual. Esta entrega não
inclui merge, deploy, alteração do GitHub Projects ou início da próxima etapa.

## Continuidade — Etapa D

A política de redução e suspensão antes fora desta etapa foi implementada em
[WEBCAM-D.md](WEBCAM-D.md). O limite inicial, a prévia e a confirmação permanecem;
a webcam suspensa só volta por nova ativação manual.

As evidências vinculadas por permalinks acima pertencem ao histórico Git; capturas e medições locais não integram a árvore atual versionada.
