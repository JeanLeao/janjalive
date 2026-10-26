# Webcam — Etapa D

Base: `main`, `4d08dc3d6913cd708d6c90e44e04fd5d3c1b6225`.
Integração com [A](WEBCAM-A.md), [B](WEBCAM-B.md) e [C](WEBCAM-C.md).
Política completa e hipóteses: [PERFORMANCE.md](PERFORMANCE.md#webcam-opcional--etapa-d).

## Implementação

- `stats/camera-quality.ts`: perfis de envio e observação por destinatário, com
  evidência sustentada, cooldown e suspensão. Sem recuperação automática.
- `stats/stats-collector.ts`: associação ao sender da câmera e coleta separada;
  validação de geração, topologia e duração antes da decisão. F34 permanece
  independente, incluindo sua recuperação.
- `webrtc/peer-manager.ts`: perfil vigente aplicado só ao sender da webcam,
  incluindo entrada tardia e recriação; usa a fila existente e versão da câmera.
  Nenhum ajuste de parâmetros produz ofertas adicionais.
- `media/camera-controller.ts`, `hooks/useRoomSession.ts`, `CameraControl.tsx` e
  `FloatingControlDock.tsx`: suspensão distinta de erro de dispositivo, liberação
  da captura, anúncio falso e aviso persistente. Nova ativação exige prévia e
  confirmação. Tela e áudio permanecem independentes.
- Testes em `camera-quality.test.js`, `stats-collector.test.js`,
  `peer-manager.test.js`, `camera-controller.test.js` e `camera-quality.spec.ts`.

Os níveis são 400 Kbps/15 FPS/escala 1 → 220 Kbps/10 FPS/escala 1,5 →
120 Kbps/7 FPS/escala 2. Perda ≥8%, RTT remoto válido ≥450 ms ou limitação
cpu/bandwidth precisam persistir em quatro amostras durante 9 s. Cada decisão
reinicia a evidência e respeita cooldown de 15 s. Suspensão requer nova evidência
no mínimo: onze amostras em 30 s. Não foram calibrados por congestionamento real.
A redução da câmera é enfileirada antes da F34 na mesma coleta, sem bloquear
redução necessária da tela. Não se usa perda de câmera para recuperar a F34.

## Validação

| Verificação | Resultado |
| --- | --- |
| `pnpm --filter @screen-room/signaling... build` | Aprovado |
| `pnpm typecheck` | Aprovado, incluindo os E2E novos |
| `pnpm test` | 447 aprovados: protocol 21, signaling 128, web 298 |
| `pnpm build` | Aprovado |
| Primeira rodada Chromium D | 3/3 aprovados (antes do reforço de sincronização) |
| Regressão Chromium A/B/C/D/F34 e ferramentas | 35/37; ocorrências explicadas abaixo |
| D desktop/mobile com coleta sincronizada, `--repeat-each=2` | 4/4 aprovados |
| Rodada D final Chromium (troca após redução e aviso recolhido) | 3/3 aprovados |
| Rodada D final Firefox | 2 fluxos aprovados; carga falhou uma vez antes da espera por todas as fontes |
| Carga Firefox com espera explícita, `--repeat-each=2` | 2/2 aprovados |
| Carga Chromium final com espera explícita | 1/1 aprovado |
| `git diff --check` | Aprovado |
| Firefox B/C/D ampliado | 11 aprovados, 5 falhas C, 1 skip B nativo |
| Firefox base: C + mesmo teste novo de carga | 3 aprovados, os mesmos 5 cenários C falharam |

A carga Firefox teve uma rodada em que um espectador reportou duas das quatro
fontes esperadas. A trace não continha redução nem suspensão automática; não se
atribui essa ocorrência à política nem à base sem evidência adicional. O teste
passou a esperar relatórios de entrada com frames decodificados de todas as
fontes antes da janela de medição, além de exigir avanço posterior. As duas
repetições seguintes passaram. O histórico não foi apagado.

O teste novo de suspensão desktop falhou na regressão. A fixture avançava o
relógio a cada 100 ms sem aguardar a conclusão da coleta; agora aguarda o evento
`network-stats` de cada coleta. As quatro repetições posteriores passaram. O
histórico da falha permanece registrado; não é classificada como preexistente.

O cenário histórico `late join and a presenter serving nine spectators` falhou
no mesmo predicado de reprodução (5 s) tanto na Etapa D quanto no SHA base
`4d08dc3d6913cd708d6c90e44e04fd5d3c1b6225`. A comparação válida usou worktree
isolada `/tmp/janjalive-webcam-d-base`, dependências do lockfile instaladas offline,
mesmo navegador/configuração/teste, sem mudanças no timeout. A causa não foi
resolvida; não se atribui essa falha à Etapa D. Tentativas anteriores da comparação
com dependências por symlink foram inválidas: pnpm recusou o diretório e depois
Nitro não iniciou o runner. Não são evidência comparativa.

A regressão cobre prévia/confirmação, permissão pendente, teclado/toque e 320px,
troca e pausa, múltiplos apresentadores, entrada tardia, recriação, desconexão,
F27, F34 desktop/mobile, layouts/Comparar e preservação das fontes de imagens,
clipes e PiP. A suíte E2E completa não foi executada.

A ampliação da validação Firefox revelou cinco cenários C que também falharam no
SHA base: layout de 390px (timeout no seletor de modo), Comparar/Cinema/ferramentas
em 1280px (popover não fecha) e 390px (predicado sem sucesso), gravação de clipe
(indicação de gravação não aparece) e simulação de conexão falha (câmera não some).
Não se afirma que todas as funcionalidades C foram validadas em Firefox. O skip B
é o já explícito para eventos `ended` artificiais no Gecko; não comprova encerramento
nativo. O mesmo teste novo de carga foi copiado para a worktree base, sem alterar
os fontes da aplicação, para permitir a comparação. Os logs também registraram
avisos React de atualização durante renderização em componentes Mantine tanto
na carga D quanto na base; origem e correção permanecem pendentes. Esses cenários
não motivaram alterações de layout, clipes ou lógica C fora do escopo D.

### Medições locais reais com fontes sintéticas

Dez contextos Chromium no mesmo host: dois apresentadores com tela + webcam e
oito espectadores. Cada apresentador teve nove conexões; cada espectador, duas.
Amostras nativas de `getStats()` separadas por aproximadamente 6 s, sem substituir
estatísticas nem simular perda nesse teste. Bitrate calculado por delta de bytes
RTP × 8 / delta de timestamp em ms, em Kbps; exclui overhead de transporte. A
fonte de saída foi associada ao sender por mid e track da captura sintética.

| Medida | Apresentador 1 | Apresentador 2 |
| --- | ---: | ---: |
| Upload de tela, soma dos nove destinatários | 274,6 Kbps | 269,9 Kbps |
| Upload de webcam, soma dos nove destinatários | 669,8 Kbps | 652,5 Kbps |
| Upload total de vídeo | 944,4 Kbps | 922,4 Kbps |
| FPS de saída da tela, snapshot final por conexão | 13 | 13 |
| FPS de saída da câmera, snapshot final por conexão | 16 | 14–15 |
| Maior RTT remoto observado no snapshot final | 4,53 ms | 5,22 ms |

Download agregado por espectador: **166,3–236,0 Kbps**, recebendo os dois
apresentadores e suas webcams. Dimensões reportadas de todos os vídeos:
640×360; FPS de recepção: 13–16. Contadores de perda de entrada e remotos no
snapshot final eram zero; isso descreve essa coleta local, sem estabelecer
qualidade em redes reais. Motivo de limitação reportado pelos encoders: `none`.
Todos os relatórios de entrada tinham frames decodificados positivos. A tela
permaneceu ativa. O teste de carga foi reforçado para exigir avanço de decodificação
em todas as fontes, além de capturar as medições.

O snapshot de 16 FPS apesar do teto solicitado de 15 ilustra a distinção entre
limites aceitos e medições do navegador. As fontes de canvas têm pouco movimento
e não representam o custo ou bitrate de câmera física ou de tela complexa. Não
houve comparação de CPU/GPU nem benchmark de contenção real ou de longa duração.
Não se infere capacidade geral para dez participantes destes valores.

Medição adicional em Firefox, após aguardar todas as fontes: upload de tela
183,7/217,3 Kbps e webcam 88,8/151,4 Kbps por apresentador (soma de nove peers),
total de vídeo 272,5/368,7 Kbps. Download por espectador 60,1–94,5 Kbps. FPS de
saída reportado: tela 8–9, câmera 9; maior RTT remoto 16,28/20,65 ms. Esses valores
são outra execução local, não um benchmark comparativo entre navegadores. O motivo
de limitação do encoder não foi fornecido nessa coleta Firefox; não se infere
ausência de limitação.

Dados brutos sem SDP/credenciais, da regressão Chromium e da repetição Firefox:
[Chromium local](docs/webcam-d/chromium-local-measurements.json),
[Firefox local](docs/webcam-d/firefox-local-measurements.json).
Evidências de redução: [desktop](docs/webcam-d/reduced-1280.png),
[mobile](docs/webcam-d/reduced-390.png). Aviso de suspensão com tela ativa:
[desktop](docs/webcam-d/suspended-1280.png),
[mobile](docs/webcam-d/suspended-390.png). Capturas inspecionadas visualmente.

## Limitações

Ambiente Linux sem dispositivos `/dev/video*` e sem configuração TURN disponível.
Não houve câmera física, permissões nativas, revogação real, áudio de sistema real,
autoplay nativo ou conectividade entre redes distintas. Safari/WebKit não validado;
a configuração E2E do projeto oferece Chromium e Firefox. Mobile usa viewport e
toque em navegador desktop. Canvas e estatísticas controladas não comprovam
congestionamento real, qualidade de uma câmera física ou capacidade de dez
participantes em hardware e redes diferentes. Sem SFU ou simulcast, upload e
custo de processamento continuam crescendo por destinatário.

Falhas intermediárias desta tarefa: a primeira suíte unitária encontrou imports
novos sem extensão `.ts`, incompatíveis com o executor Node; corrigidos. O primeiro
typecheck do novo E2E encontrou acesso a `videoWidth` sem cast; corrigido. Essas
falhas foram introduzidas durante a tarefa e não são atribuídas à base.

Logs locais: `/tmp/webcam-d-prepare.log`, `/tmp/webcam-d-types-final.log`,
`/tmp/webcam-d-tests-final.log`, `/tmp/webcam-d-web-tests-final.log`,
`/tmp/webcam-d-build.log`, `/tmp/webcam-d-regression.log`,
`/tmp/webcam-d-repeat.log`, `/tmp/webcam-d-firefox.log`,
`/tmp/webcam-d-base-nine-final.log` e `/tmp/webcam-d-base-firefox.log`.
Rodadas direcionadas finais: `/tmp/webcam-d-e2e-final.log` e
`/tmp/webcam-d-firefox-final.log`, `/tmp/webcam-d-firefox-load-final.log` e
`/tmp/webcam-d-chromium-load-final.log`. Os totais de rodadas sobrepostas não devem
ser somados como casos distintos.

PR deve permanecer draft para revisão técnica, sem merge ou deploy.

## Correção da revisão do PR #47 — perda total e baixo tráfego

O observador aceita deltas remotos com zero recebimentos e perdas positivas.
O mínimo de 50 pacotes passa a ser acumulado em uma janela móvel de 12 s
(deltas com idade estritamente menor que 12 s), em vez de exigido por coleta.
A janela usa somente intervalos consecutivos com timestamps frescos, contadores
monotônicos, tráfego positivo e associação ao mesmo sender/track/conexão/relatório.
Um intervalo inválido ou sem tráfego descarta a acumulação e a persistência de
perda. Cada decisão continua limpando toda a evidência. Uma coleta atual com
perda abaixo de 8% interrompe a persistência da perda, mesmo se a janela ainda
contiver perdas anteriores; RTT atual e limitação do encoder seguem independentes.
A recuperação de relatórios não reativa nem eleva automaticamente a câmera.

Mantidos os perfis, quatro amostras/9 s para redução, onze amostras/30 s no
mínimo para suspensão e cooldown de 15 s. A janela precisa reunir volume antes
de começar a contar evidência: com 20 pacotes/coleta de 3 s, a primeira redução
ocorre somente na sétima coleta; após reset no mínimo, a suspensão ocorre somente
na décima quarta. Dois pacotes/coleta nunca atingem volume suficiente nessa janela.
Nenhuma alteração de produção no coletor, na tela ou na F34.

Regressões novas: perda de 100%, perda de 10% com 20 pacotes/coleta,
recuperação seguida de nova degradação, contadores parados/reiniciados, relatórios
antigos/ausentes/desassociados, gerações de RTP, desconexão e ausência/escassez de
tráfego. No coletor, resultados pendentes não suspendem após reset de geração,
mudança de topologia/câmera, desconexão ou atraso superior a duas cadências.
Os cenários integrados de perda total e baixo volume também verificam duas
reduções, suspensão, ausência de redução da tela e recuperação independente F34.

Validação desta correção:

| Comando | Resultado |
| --- | --- |
| `pnpm --filter @screen-room/signaling... build` | Aprovado |
| `pnpm --filter @screen-room/web exec node --test test/camera-quality.test.js test/stats-collector.test.js` | 66 aprovados |
| `pnpm typecheck` | Aprovado, incluindo E2E alterado |
| `pnpm test` | 467 aprovados: protocol 21, signaling 128, web 318 |
| `pnpm build` | Aprovado; avisos do bundler sobre diretivas de módulo |
| `pnpm --filter @screen-room/web test:e2e --grep 'webcam D:|F34' --workers=1` | Rodada final Chromium: 5/5 aprovados |
| `git diff --check` | Aprovado |

O E2E D desktop agora injeta perda total; o mobile (390px/toque) injeta 20
pacotes por coleta com perda de 10%. Ambos validam redução, entrada tardia,
suspensão, tela ativa com parâmetros preservados e reinício manual. A rodada
final inclui a carga de dez participantes e F34 em 1280px/390px.

Duas rodadas anteriores tiveram interferência de builds/edição concorrentes ao
Vite, portanto não isolam a correção. Primeira rodada (dois workers): 2/5,
com falhas na espera pela coleta D desktop, indicação visual F34 desktop e
fontes ausentes na carga. Segunda (um worker): 3/5, com falhas na espera pela
coleta D desktop e conexão inicial D mobile. A trace da segunda registra
fechamento/recriação de conexões durante a edição do fonte; também ocorreram
builds durante essas execuções. A rodada final, sem builds ou edições concorrentes,
passou em 5/5. Não se classificam as falhas intermediárias como preexistentes nem
se afirma que todas têm a mesma causa. Nenhuma investigação já comparada à base
foi repetida. Firefox não foi repetido nesta correção; suíte E2E completa e
condições nativas/rede real continuam não verificadas.

Logs desta revisão: `/tmp/webcam-d-fix-prepare.log`,
`/tmp/webcam-d-fix-unit.log`, `/tmp/webcam-d-fix-types.log`,
`/tmp/webcam-d-fix-tests.log`, `/tmp/webcam-d-fix-build.log`,
`/tmp/webcam-d-fix-e2e.log`, `/tmp/webcam-d-fix-e2e-serial.log` e
`/tmp/webcam-d-fix-e2e-final.log`.
