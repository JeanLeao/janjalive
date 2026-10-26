# Benchmark local

Usar Node 22+ e pnpm da raiz (packageManager). Instalar dependências com
`pnpm install --frozen-lockfile` e Chromium com
`pnpm --filter @screen-room/web exec playwright install chromium` se necessário.
Não executar builds, outros Playwright ou runners durante a medição.
Portas locais 4310/4311 devem estar livres; o runner inicia e encerra os mesmos
serviços de signaling/Vite da configuração E2E existente. Não usa produção.

```sh
pnpm --filter @screen-room/signaling... build
node --test apps/web/benchmark/*.test.mjs
export F20_OUTPUT="/tmp/screen-f20-$(date +%Y%m%d-%H%M%S)-$$"
pnpm --filter @screen-room/web exec playwright test --config benchmark/playwright.config.mjs
node apps/web/benchmark/summarize.mjs "$F20_OUTPUT"
node apps/web/benchmark/validate.mjs "$F20_OUTPUT"
```

São nove casos sequenciais, B01/B02/B03 com três repetições, um worker e nenhum
retry. Cada rodada cria contextos novos no mesmo Chromium headless: um
apresentador e 1/4/9 espectadores, todos presentes antes da publicação.
A fonte deriva do helper syntheticCapture do E2E: canvas 640×360, timer de
50 ms, captureStream(20), cores alternadas e quadrado móvel, sem áudio. A
substituição de getDisplayMedia existe apenas no navegador de teste. O perfil
inicial da aplicação é Nitidez/Equilibrado/30. Settings, constraints e parâmetros
dos senders registram o resultado efetivamente aplicado; não representam FPS medido.

O início do tempo de publicação é performance.now() do Node imediatamente antes
do click Playwright em Entrar ao vivo (inclui despacho/actionability do click).
O primeiro callback remoto do observador de apresentação é comunicado via exposed binding;
o Node registra sua chegada usando o mesmo relógio monotônico. Não há subtração
de relógios entre processos. Esse tempo inclui transporte e agendamento do
harness, não mede latência interna de mídia. O observador é armado antes da
publicação, identifica tracks dos receivers e usa requestVideoFrameCallback.
MutationObserver e varredura de 20 ms detectam o binding ao elemento: pode haver
frame anterior ao registro do callback, e esse atraso integra a observação.
Ausência de API e timeout de 15 s são estados distintos, impedindo classificar
uma rodada sem apresentação como sucesso. Não se usa framesDecoded como prova.

Após todas as primeiras apresentações: 3 s de assentamento, baseline e 15
intervalos de aproximadamente 1 s (janela agendada de 15 s). JSON guarda tempo
real de cada snapshot e timestamps dos relatórios. Deltas usam timestamps do
mesmo relatório, sem comparar processos. Contador reiniciado, relatório trocado,
timestamp repetido/inválido ou campo ausente gera null; perda sem tráfego também.
Perda de envio só é calculada quando remote-inbound-rtp ligado via localId
fornece ambos packetsReceived e packetsLost. Sem os dois campos não há estimativa.
RTT vem exclusivamente do candidate-pair selecionado por transport; ausência não
é zero. FPS é framesPerSecond do relatório, não derivado do perfil. SSRC associa
cada conexão do apresentador ao espectador; conexão tem índice local ao participante.

O resumo usa média aritmética/min/max/contagem de intervalos válidos por conexão;
não produz percentis nem intervalo de confiança. Upload é a soma dos bitrates
válidos de outbound-rtp do apresentador, somente com todas as conexões presentes.
Volume soma deltas de bytesSent da janela. São payloads de vídeo RTP, sem áudio
nesta fonte: não incluem todo overhead nem o tráfego total da interface/sistema.

Parada normal verifica vídeos removidos, tracks locais ended e senders sem track.
Finalmente navega cada página para about:blank (destrói o realm e seus timers,
listeners, sockets e PCs), fecha todos os contextos e registra quantos restaram.
O finally também executa em falhas, preservando fase/diagnóstico e amostras parciais.
Playwright encerra o browser e os servidores ao término do comando.

Cada invocação exige um **diretório ainda inexistente** em F20_OUTPUT. Sem a
variável, o padrão continua /tmp/screen-f20-results, mas será recusado se já
existir, mesmo vazio. Não criar o diretório antes nem reaproveitar uma campanha
parcial. Nenhum artefato antigo é removido ou sobrescrito pelo runner. Os arquivos
Playwright usam um diretório temporário novo com prefixo /tmp/screen-f20-playwright-.

O globalSetup reserva o diretório por mkdir exclusivo, cria campaign.json com
UUID e status running e transmite o ID aos workers. Cada rodada grava seu ID
com criação exclusiva (wx). O reporter só finaliza o manifesto quando a mesma
invocação terminou com exatamente as nove rodadas únicas aprovadas, verificando
identidade, nomes, cenário, repetição, participantes, configuração comum e limpeza.
O manifesto complete inclui hashes SHA-256 dos nove arquivos.

Summarizer e validador usam o mesmo carregador: exigem manifesto completo e os
nove JSONs exatos, IDs e hashes correspondentes. Rejeitam arquivos extras,
faltantes, duplicados, alterados e metadados incorretos. O resumo carrega o ID e
o hash de origem por rodada; o validador recusa resumo antigo ou duplicado.
Dados inválidos são recusados antes de imprimir tabelas ou substituir summary.json.
Não substituir o reporter por --reporter: sem ele a campanha não será finalizada.
Esse mecanismo evita mistura acidental, não autentica dados contra adulteração
intencional de arquivos e manifesto por alguém com acesso ao disco.

Para diagnóstico isolado, acrescentar --grep 'B01 round 1', sempre em diretório
novo. O processo pode aprovar esse caso, mas a campanha fica running/incompleta;
nenhum resumo completo é gerado. Interrupções e falhas também não são retomadas
ou completadas com resultados antigos. Não compartilhar arquivos brutos sem revisão.

CPU/memória de processos não são coletadas: o browser e seu processo de rede são
compartilhados, junto com renderer/GPU, signaling e Vite no host. Memória livre e
load do SO são somente contexto no início da rodada, não consumo atribuído.

Controle negativo reproduzível, separado da campanha: descarta somente a
notificação ao harness, preservando mídia e callback nativos. O Playwright deve
retornar falha por timeout; o validador seguinte deve passar:

```sh
export F20_OUTPUT="/tmp/screen-f20-timeout-$(date +%Y%m%d-%H%M%S)-$$"
F20_FORCE_PRESENTATION_TIMEOUT=1 \
  pnpm --filter @screen-room/web exec playwright test \
  --config benchmark/playwright.config.mjs --grep 'B01 round 1'
node apps/web/benchmark/validate.mjs "$F20_OUTPUT" --timeout
```

Não usar a variável de injeção na campanha. O caso negativo não é evidência de
falha da aplicação e seus artefatos não devem ser misturados aos resultados.
