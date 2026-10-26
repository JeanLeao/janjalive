# Webcam no palco — Etapa C

Base: `main`, `e18db2882358d44836c4f33f51f08d7ffca75ecc`.
Integração com [Etapa A](WEBCAM-A.md) e [Etapa B](WEBCAM-B.md).

## Composição e privacidade

`useRoomSession` expõe `remoteCameraStreams`, indexado por apresentador e separado
de `remoteStreams`, consumindo `onRemoteCameraStream`. A limpeza acompanha
indisponibilidade anunciada, remoção/recriação do peer, desconexão e teardown.
Falha de conexão esconde o vídeo sem descartar a fonte que pode voltar após
recuperação por ICE; falhas de reprodução também escondem a imagem.
O callback ignora sessões descartadas; as proteções de geração e identificação do
PeerManager continuam intactas. O componente observa `ended`, `mute`, `unmute` e
mudanças de tracks para esconder vídeo indisponível e libera listeners e
`srcObject` ao desmontar ou trocar de fonte.

A câmera só integra um item de apresentação existente. A câmera local usa apenas
`CameraSnapshot.state === 'live'`: a prévia privada não aparece no palco. Trocar a
fonte preserva a câmera publicada; pausa explícita ou fim da apresentação a remove.
A seleção principal resolve a câmera pelo mesmo identificador da tela; Comparar
faz isso para os dois painéis.

Os vídeos são elementos irmãos da área de zoom/anotações, sempre mudos e com PiP
desabilitado. Layouts são CSS local, sem captura, renegociação, composição de
tracks ou canvas de publicação. Os refs e streams usados por áudio, imagens,
clipes e PiP continuam sendo exclusivamente os da tela. O vídeo de câmera não se
registra no roteador de áudio.

## Interface

A preferência é mantida no estado do RoomStage, compartilhada entre os painéis e
preservada ao trocar a apresentação destacada. Não há armazenamento persistente
nem mensagens de sinalização para layout.

- **Sobreposta**, padrão no canto inferior esquerdo: quatro cantos, com recuos
  para identificações, barra de ferramentas e dock.
- **Separada**: tela ocupa a maior parte da largura; câmera ao lado quando o
  painel tem mais de 600px, abaixo em painéis estreitos. A consulta usa a largura
  do painel, inclusive em Comparar desktop.
- **Oculta**: remove apenas o vídeo local. O controle permanece na barra enquanto
  houver câmera disponível e permite reexibi-la sem reiniciar a transmissão.

O popover contextual tem foco contido e retorno de foco, rótulos nativos,
seletores com altura mínima de 44px e foco visível. O botão segue o alvo de 44px
da barra existente. O portal fica dentro do palco para funcionar em tela cheia.
Cinema e Comparar preservam a preferência. O Comparar mobile mantém a rolagem
existente entre painéis; a evidência do segundo painel exige rolar o palco.

## Evidências e validação

Capturas sintéticas inspecionadas em desktop 1280×844 e mobile 390×844/320×844:

| Estado | Desktop | Mobile |
| --- | --- | --- |
| Sobreposta inferior esquerda | [1280](docs/webcam-c/overlay-bottom-left-1280.png) | [390](docs/webcam-c/overlay-bottom-left-390.png), [320](docs/webcam-c/overlay-bottom-left-320.png) |
| Sobreposta superior direita | [1280](docs/webcam-c/overlay-top-right-1280.png) | [390](docs/webcam-c/overlay-top-right-390.png), [320](docs/webcam-c/overlay-top-right-320.png) |
| Outros cantos | [Superior esquerdo](docs/webcam-c/overlay-top-left-1280.png), [inferior direito](docs/webcam-c/overlay-bottom-right-1280.png) | [Superior esquerdo 320](docs/webcam-c/overlay-top-left-320.png), [inferior direito 320](docs/webcam-c/overlay-bottom-right-320.png) |
| Separada | [1280](docs/webcam-c/separate-1280.png) | [390](docs/webcam-c/separate-390.png), [320](docs/webcam-c/separate-320.png) |
| Oculta | [1280](docs/webcam-c/hidden-1280.png) | [390](docs/webcam-c/hidden-390.png), [320](docs/webcam-c/hidden-320.png) |
| Comparar: duas webcams | [Sobrepostas](docs/webcam-c/compare-overlay-1280.png), [separadas](docs/webcam-c/compare-separate-1280.png) | [Sobrepostas](docs/webcam-c/compare-overlay-390.png), [separadas](docs/webcam-c/compare-separate-390.png), [segundo painel após rolar](docs/webcam-c/compare-secondary-390.png) |
| Cinema | [1280](docs/webcam-c/cinema-1280.png) | [390](docs/webcam-c/cinema-390.png) |
| Tela cheia | [1280](docs/webcam-c/fullscreen-1280.png) | [390](docs/webcam-c/fullscreen-390.png) |
| Troca de origem com câmera ativa | [1280](docs/webcam-c/switch-1280.png) | [390](docs/webcam-c/switch-390.png), [320](docs/webcam-c/switch-320.png) |
| Câmera desligada, tela ativa | [1280](docs/webcam-c/absent-1280.png) | [390](docs/webcam-c/absent-390.png), [320](docs/webcam-c/absent-320.png) |
| Desconexão do apresentador | [1280](docs/webcam-c/disconnect-1280.png) | [390](docs/webcam-c/disconnect-390.png), [320](docs/webcam-c/disconnect-320.png) |

[Composição local publicada](docs/webcam-c/local-published-1280.png) e
[PNG exportado contendo somente tela](docs/webcam-c/screen-only.png).
[Comparar com chat aberto e câmeras afastadas das ferramentas](docs/webcam-c/compare-chat-1280.png).
A rodada direcionada final repete os sete cenários C da regressão; os totais não
devem ser somados como casos distintos. Todas as evidências foram inspecionadas.

| Verificação | Resultado |
| --- | --- |
| `pnpm --filter @screen-room/signaling... build` | Aprovado |
| `pnpm typecheck` | Aprovado |
| `pnpm test` | 430 aprovados: protocol 21, signaling 128, web 281 |
| `pnpm build` | Aprovado |
| Regressão E2E Chromium abaixo | 28/28 aprovados |
| `pnpm --filter @screen-room/web test:e2e --grep 'webcam C:' --workers=1` | 7/7 aprovados após ajuste de recuo com chat aberto; inclui troca do destaque |
| `git diff --check` | Aprovado |

```sh
pnpm --filter @screen-room/web test:e2e --grep 'webcam C:|webcam B:|F21 local zoom|F22 both annotation|F30 screenshot captures|F16 original source|PiP|Cinema preserves|participants enter before capture|spectator and presenter recover' --workers=1
```

Inclui ciclo de captura, erros e prévia privada B, entrada tardia, reconexão do
espectador e do apresentador, falha/recuperação de conexão, pausa/saída, layouts
sem nova captura/oferta, troca de destaque preservando a associação da câmera, zoom sem deslocar câmera, teclado/Escape/retorno de foco,
toque e ausência de áudio nos vídeos de câmera. O teste de ferramentas intercepta
a fonte de `drawImage`, o vídeo solicitado ao PiP e as tracks/clones recebidos
pelo MediaRecorder, mantendo a gravação e a reprodução reais no navegador.
O áudio de tela sintético permanece independente durante layout e troca de fonte.

Ocorrências intermediárias: o cenário 320px teve uma falha procurando o controle
de câmera após iniciar a tela; a fixture passou a reabrir o dock antes da busca.
Uma rodada foi interrompida por um erro novo de teste que buscava o segundo
painel no cenário de apresentação única; o reinício imediato encontrou a porta
4310 ainda ocupada durante a finalização. A primeira instrumentação do clipe
comparava IDs de clones com os originais; foi corrigida para rastrear a origem
dos clones. Essas ocorrências não são classificadas como falhas preexistentes.
Os primeiros screenshots identificaram e levaram à correção de sobreposição da
webcam separada com o dock e com a barra de ferramentas.

A regressão de rotas demo emitiu avisos de hidratação React (ícones do dock),
embora os testes tenham passado. Não foi determinada a origem por comparação
com a base; isso permanece registrado para investigação, sem classificá-lo como
preexistente.

Logs locais: `/tmp/webcam-c-prepare.log`, `/tmp/webcam-c-types-final.log`,
`/tmp/webcam-c-test-final.log`, `/tmp/webcam-c-build-final.log`,
`/tmp/webcam-c-e2e-final.log` e `/tmp/webcam-c-visual-final.log`.

Arquivos de implementação: `useRoomSession.ts`, `RoomStage.tsx`, `StageCamera.tsx`,
`StageCamera.css`, `CameraControl.tsx` e rota `room.$roomId.tsx`. Testes em
`camera-stage.spec.ts` e helpers compartilhados extraídos de `camera-capture.spec.ts`
para `e2e/fixtures/camera.ts`. Documentação em README, este registro e
`docs/webcam-c/*.png`. Protocolo, signaling, PeerManager e infraestrutura intactos.

## Limites

Captura de tela e câmera de canvas, áudio sintético, Chromium desktop com viewport
mobile e toque emulado. Não comprovam câmera física, permissões nativas, áudio
real, autoplay real, Safari/WebKit, nem STUN/TURN entre redes distintas. A suíte
E2E completa e o cenário de nove espectadores não fazem parte desta rodada.
Não há adaptação automática de qualidade de câmera.

O PR permanece draft para revisão técnica e aprovação visual. Sem merge, deploy,
GitHub Projects ou início da próxima etapa.

## Continuidade — Etapa D

A adaptação independente da câmera foi implementada em [WEBCAM-D.md](WEBCAM-D.md).
Suspensão remove a câmera do palco pelo estado anunciado existente, preservando
as fontes exclusivas de tela em screenshots, clipes e PiP.
