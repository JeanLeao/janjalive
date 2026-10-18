# F22 — evidências e validação

O modo Comparar mantém a principal no fluxo de seleção do palco/F29 e guarda a
secundária somente no componente local. Reutiliza os MediaStreams existentes,
com um player por painel e sem miniaturas redundantes durante a comparação.
Cada player mantém seu zoom e suas anotações. O secundário é sempre silenciado,
não oferece criação de anotações, screenshot ou PiP e desabilita o PiP nativo.
O player principal é preservado ao entrar/sair da comparação.

## Capturas

Capturas geradas pelo teste `F22 comparison is local, follows only primary and
recovers lifecycle`, usando fontes sintéticas. Desktop: 1440 × 900. A interação
mobile foi validada em 390 × 844 e 320 × 740, com toque habilitado. Para mostrar
ambos os painéis nas evidências, a altura da captura mobile foi ampliada para
1500 px, mantendo a largura; o teste retorna ao viewport original após capturar.

| Largura | Duas ativas | Secundária pausada |
| --- | --- | --- |
| Desktop | [Ativas](f22-desktop-active.png) | [Pausada](f22-desktop-paused.png) |
| 390 px | [Ativas](f22-mobile-390-active.png) | [Pausada](f22-mobile-390-paused.png) |
| 320 px | [Ativas](f22-mobile-320-active.png) | [Pausada](f22-mobile-320-paused.png) |

Os controles usam alvos de pelo menos 44 px em mobile/toque; o desktop mantém
os controles compactos existentes. Os seletores nativos têm alvo de 44 px.
A comparação reserva espaço para o dock e permite rolagem vertical no mobile.
A revisão visual com a skill Impeccable e a conferência documental tiveram
veredito `ship` no escopo da extensão e das seis capturas, preservando o estilo
existente. Isso não representa validação nativa de mídia.

## Testes específicos

`pnpm --filter @screen-room/web exec playwright test -g F22 --workers=1 --output=test-results/f22-ready`

Resultado: **5 passaram**. Cobertura:

- Entrada por teclado, saída explícita, três fontes, substituição local da
  secundária sem publicar seleções e sem suspender o F29.
- Mudança automática da principal para a antiga secundária, reaproveitando a
  principal anterior; seleção manual da principal suspende o acompanhamento.
- Zoom independente, operação por toque, layout em 1440/390/320 px e retorno ao
  palco quando sobra uma transmissão elegível.
- Pausa, retomada, reconexão, troca de origem e encerramento; secundária
  silenciada também com tracks de áudio sintéticas; sem conexões adicionais.
- Anotações nos dois painéis, ferramentas somente no principal e limpeza do
  elemento de vídeo secundário ao sair.
- Cinema, fullscreen do conjunto, screenshot PNG do principal e PiP preservado
  na entrada/saída da comparação, encerrando na troca da principal.

## Limitações

Chromium headless com captura de canvas e áudio sintético. PiP usa um mock da
API nativa para validar seu ciclo de vida; screenshot gera um download PNG real.
Fullscreen usa a API do navegador headless. Não foram testados seletor e
permissões nativos, áudio real da aba/sistema, autoplay em dispositivos reais,
Safari/iOS/Android reais, conectividade STUN/TURN entre redes distintas nem
impacto de desempenho em hardware real. O mobile é emulado no Chromium.

## Verificações do workspace e regressão

Ambiente: Node.js 22.23.3, pnpm 12.6.0 e Chromium headless do Playwright.

| Comando | Resultado |
| --- | --- |
| `pnpm --filter @screen-room/signaling... build` | Protocol e signaling preparados |
| `pnpm typecheck` | Passou |
| `pnpm test` | 237 passaram: protocol 16, signaling 90, web 131 |
| `pnpm build` | Passou |
| `pnpm --filter @screen-room/web exec playwright test follow.spec.ts viewing-modes.spec.ts zoom.spec.ts sharing.spec.ts --grep-invert 'late join and a presenter serving nine spectators' --workers=2 --output=test-results/f22-regression-final` | 89 passaram, incluindo os cinco novos F22 |
| `git diff --check` | Passou |

A regressão cobre também início/parada/reinício, prévia privada, entrada tardia,
negociação simultânea, troca de origem, reconexão, limpeza, anotações, F29, F30,
Cinema, fullscreen, PiP, zoom, teclado e toque. Não houve alteração de protocolo,
signaling, negociação, codecs ou captura.

### Ressalva: teste de capacidade com nove espectadores

O teste existente `late join and a presenter serving nine spectators` foi
executado separadamente. Rodadas iniciais da branch falharam no prazo de cinco
segundos da asserção de recebimento/apresentação de frames. Uma execução isolada
posterior da branch passou (9,7 s), e uma execução isolada da `main` no commit
`e2ce29f1e9e069f78c13b5f4393130861a847cd6` também passou (9,8 s). Assim, o cenário
não está consistentemente verde e **a origem da falha não foi determinada nem
classificada como preexistente**. Não houve mudança de arquitetura ou de limites
para contornar o teste.

A tentativa com `--repeat-each=2` passou na primeira repetição e falhou na segunda
antes da captura, esperando `Conectado` na mesma sala fixa; essa falha de conexão
é distinta dos timeouts de frames. A comparação com a base usou um checkout
separado, dependências locais compartilhadas e apenas configuração de acesso do
Vite aos caminhos dessas dependências. Tentativas iniciais dessa preparação
falharam por resolução de módulos e não foram contadas como resultados da base.

Rodadas iniciais de E2E com argumentos de script inadequados e execuções
sobrepostas tiveram conflito de portas/artefatos ou foram interrompidas. Os
resultados válidos acima vieram de execuções sequenciais, em diretórios de saída
separados. A execução acidental mais ampla também apresentou uma falha de
reconexão em enquetes; não foi classificada como preexistente, e essa suíte não
compõe os 89 E2E de visualização/compartilhamento declarados aqui.
