# Investigação de intermitências WebRTC e F13

Base: `main` / `origin/main`, commit `2d252d2938a91c479f02071a39d9068970cffa61`.
Investigação realizada na branch `fix/webrtc-test-stability`; os resultados abaixo
foram registrados antes da publicação do commit e do PR.

## Ambiente e método

Validação em WSL2, Linux `6.18.54.1-microsoft-standard-WSL2`, 6 CPUs,
11,7 GiB de memória, Node `22.23.3`, pnpm `12.6.0`, Playwright `1.64.0`,
Chromium headless `156.0.8078.4`. E2E com signaling/Vite locais,
captura sintética de canvas e um worker; nenhum retry global foi adicionado.
Os E2E finais foram executados sequencialmente, com diretórios de saída distintos.

## A — Capacidade

O teste enviava `join` depois de 20–40 ms, sem observar a abertura do socket.
`SignalingClient.send()` retorna `false` quando o socket ainda não abriu;
essa falha era ignorada. Depois, os testes presumiam a conclusão da negociação
após 60–80 ms. Além disso, a reconexão do espectador podia aprovar examinando
a descrição remota da conexão anterior, e `disconnect()` representava saída
voluntária, embora o comentário descrevesse uma queda involuntária.

Evidência controlada: mantendo o servidor e a negociação reais do teste, atrasar
somente o envio do handshake HTTP WebSocket em 100 ms, com `ws.finishRequest`,
fez os dois testes originais falharem por ausência de peer. Isso comprova a
corrida, embora não permita afirmar que foi o mecanismo exato da falha histórica,
para a qual não há trace neste checkout. Sem injeção, 20/20 execuções originais
passaram (40 casos).

A correção em `apps/web/test/capacity-webrtc.test.js` aguarda estado `connected`,
confirma o envio de `join` e sua resposta `peers`, e exige oferta e resposta
aplicadas com ambos os peers em estado estável. Saída, liberação de vaga e
remoção de peers são observadas antes da próxima ação. As quedas usam
`terminate()` no socket de teste, preservando token/reserva; as conexões antigas
são encerradas antes de exigir nova negociação. Os nove espectadores, incluindo
o entrante tardio, são renegociados após a queda do apresentador. Erros assíncronos
são coletados e reprovam o teste; a limpeza encerra sockets, peers, tracks e servidor.
O atraso de handshake de 100 ms permanece como injeção de regressão nos dois casos.

As esperas consultam condições a cada 5 ms, com prazo máximo de 3 s e diagnóstico
filtrado de estado/mensagens/SDP por tipo, sem tokens ou conteúdo de SDP.
O prazo usa `performance.now()`. Na versão intermediária com `Date.now()`, uma
de 20 execuções com handshake atrasado falhou prematuramente: o teste inteiro
durou aproximadamente 1,3 s, embora a espera supostamente tivesse atingido 3 s.
Uma medição independente confirmou dois saltos do relógio de parede:
2742 e 2750 ms contra aproximadamente 100 ms no relógio monotônico, respectivamente.
Isso justifica o relógio monotônico; não comprova a causa das falhas F13.

Resultados após a sincronização: 30/30 execuções sem atraso; uma execução com
atraso passou; a versão final com atraso e prazo monotônico passou em 30/30
execuções (60 casos). Como controle negativo, descartar respostas SDP em uma
cópia temporária fez ambos os casos falharem com diagnóstico de negociação
incompleta. As cópias temporárias foram removidas.

Esses testes usam `MockRTCPeerConnection`: comprovam o fluxo de sinalização e
aplicação de oferta/resposta, não transporte ou reprodução de mídia. Essas
assertivas permanecem nos E2E com WebRTC real.

## B — F13 e frames

A falha histórica de `frames(late)` não foi reproduzida. Não foi identificada
causa comprovada em negociação, recebimento, decodificação, reprodução ou
contenção. Não houve mudança em produção, captura sintética, assertivas de
mídia ou timeout de 5 s. Não se declara esse problema resolvido.

Em `apps/web/e2e/sharing.spec.ts`, o diagnóstico de falha de `frames()`
foi ampliado. O anexo `playback-state` passa a incluir pacotes/bytes recebidos,
quadros recebidos/decodificados/descartados, keyframes, estados ICE e SDP,
callbacks de apresentação, estado/erro do vídeo, visibilidade da página e tipos
de mensagens. SDP, tokens, candidatos e credenciais não são anexados.
Isso permite distinguir falha de transporte, decodificação e apresentação em
uma próxima ocorrência, mantendo a exigência de vídeo remoto reproduzido.

Execuções iniciais:

- Suíte web original: 78/78.
- F13/Anotações: o cenário de permissões passou. O resultado total 10/11 foi
  invalidado por uma sobreposição acidental de duas invocações Playwright:
  houve conflito de porta e remoção concorrente de arquivos de trace. A falha
  de infraestrutura não foi atribuída à aplicação; as rodadas seguintes usam
  saídas distintas e execução sequencial.
- Cinco execuções isoladas iniciais: 3/5 passaram; duas falharam na espera de
  expiração das anotações (538 pixels remanescentes após 12 s), antes da entrada
  tardia. Não houve falha de mídia. Houve verificações independentes do workspace
  em paralelo em parte dessa rodada; não é uma medição de isolamento de carga.
  Os traces estão em `/tmp/screen-focused-before-artifacts`.

Execuções intermediárias com o diagnóstico ampliado:

- Conjunto F13/Anotações repetido três vezes: 32/33, distribuídos em 11/11,
  10/11 e 11/11. O cenário de permissões passou em 3/3. A única falha foi em
  `F13 spectator quick pointing`, aguardando `aria-pressed=false` depois de
  Escape; a mídia já havia passado. Trace em `/tmp/screen-joint-artifacts`.
- Cinco repetições isoladas seguintes: 4/5 passaram. A falha ocorreu na
  reconexão, com `Execution context was destroyed`, e não em `frames(late)`.
  O trace mostrou `[vite] server connection lost. Polling for restart...`.
  O cenário fechava todos os sockets coletados, inclusive o HMR do Vite, cuja
  recuperação pode recarregar a página. Essa injeção equivocada é uma causa
  comprovada de instabilidade adicional no cenário solicitado; não se afirma
  que explique a falha histórica de vídeo. Trace em
  `/tmp/screen-focused-final-artifacts`.
- O teste de um apresentador com nove espectadores passou (1/1), incluindo
  recepção, decodificação e apresentação com o helper compartilhado.

A injeção de queda do cenário de permissões agora fecha exclusivamente sockets
cuja URL inclui `/signal`. A espera exige um socket de signaling aberto e um
novo `peers` em relação à contagem anterior à queda, confirmando reentrada em
vez de aceitar apenas a existência de algum socket aberto. A reprodução de
mídia e as permissões continuam sendo verificadas depois disso.

Validação depois dessa correção:

- `F13 collaborative drawing permissions`: 5/5 repetições isoladas aprovadas.
- `F13|Annotations menu`: 11/11 em execução conjunta; o cenário de permissões
  passou mais uma vez, totalizando 6/6 após o ajuste.
- `pnpm typecheck`: aprovado novamente com a versão final do E2E.
- Nenhuma ocorrência da falha histórica de frames no participante tardio.

As falhas de expiração (2 ocorrências) e de Escape (1 ocorrência) são achados adicionais. Não foi demonstrada
causa compartilhada com a falha histórica de vídeo; não foram corrigidas nem
classificadas como preexistentes. Impedem declarar toda a suíte estável.

## Comandos e evidências

Preparação: `pnpm --filter @screen-room/signaling... build`.
Repetições de capacidade: `node --test apps/web/test/capacity-webrtc.test.js`
(em laços com logs por execução); experimentos controlados em cópias temporárias
no mesmo diretório, removidas após uso. Logs em `/tmp/screen-capacity-before`,
`/tmp/screen-capacity-after`, `/tmp/screen-capacity-final` (versão intermediária),
`/tmp/screen-capacity-monotonic` (versão final), `/tmp/screen-delayed-before.log`,
`/tmp/screen-delayed-after.log` e `/tmp/screen-no-answer.log`.

Comandos E2E, prefixados por `pnpm --filter @screen-room/web test:e2e`:

- `--grep 'F13 collaborative drawing permissions' --repeat-each=5 --workers=1`
  em três rodadas, com `--output` distinto por rodada (3/5, 4/5 e 5/5).
- `--grep 'F13|Annotations menu'`, inicialmente uma vez e depois com
  `--repeat-each=3 --workers=1 --output=/tmp/screen-joint-artifacts`, seguido
  por uma rodada final com `--workers=1 --output=/tmp/screen-signal-only-joint-artifacts`.
- `--grep 'late join and a presenter serving nine spectators'`
  com `--output=/tmp/screen-nine-artifacts`.

Verificações do workspace: `pnpm --filter @screen-room/web test`, `pnpm test`,
`pnpm typecheck`, `pnpm build` e `git diff --check`.
Logs em `/tmp/screen-after-web.log`, `/tmp/screen-after-workspace.log`,
`/tmp/screen-typecheck.log`, `/tmp/screen-build.log` e logs E2E
`/tmp/screen-joint.log`, `/tmp/screen-focused-final.log`, `/tmp/screen-nine.log`.
Após finalizar o teste de capacidade, as verificações foram repetidas:
web 78/78; workspace 163/163 (protocol 13, signaling 72, web 78);
tipos e build aprovados. Após o último ajuste exclusivamente no E2E, os tipos
foram verificados mais uma vez. O build emitiu avisos de bundling de diretivas
`use client` de dependências, sem falha.
No total: web completa três vezes (incluindo baseline), workspace duas vezes,
typecheck três vezes e build do workspace duas vezes, além da preparação.
Os logs finais estão em `/tmp/screen-final-{web,workspace,typecheck,build}.log`,
`/tmp/screen-signal-only-{focused,joint,typecheck}.log` e os traces finais em
`/tmp/screen-signal-only-focused-artifacts` e `/tmp/screen-signal-only-joint-artifacts`.
`git diff --check` também passou.
Esses artefatos em `/tmp` são locais e não estão versionados.

Não foram executados todos os E2E da aplicação nem Firefox. Não foram validados
permissões nativas, áudio real de aba/sistema, autoplay com fonte real ou
STUN/TURN entre redes distintas. Não houve mudança visual ou de produção.
Os diretórios locais não rastreados `.agent/`, `.impeccable/` e `screenshots/`
foram preservados. A investigação não incluiu merge ou deploy; commit, push e PR
foram autorizados posteriormente em handoff específico de publicação.
