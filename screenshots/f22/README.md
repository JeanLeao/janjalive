# F22 — evidências e validação

O modo Comparar mantém a principal no fluxo de seleção do palco/F29 e guarda a
secundária somente no componente local. Reutiliza os MediaStreams existentes,
com um player por painel e sem miniaturas redundantes durante a comparação.
Cada player mantém seu zoom e suas anotações. O secundário é sempre silenciado,
não oferece criação de anotações, screenshot ou PiP e desabilita o PiP nativo.
O player principal é preservado ao entrar/sair da comparação.

## Refinamento visual dos controles do palco e modo Comparar

- **Centrado no vídeo:** removidos os cabeçalhos em bloco (`.comparison-header` de 52 px), as barras de rodapé em largura total e o `padding-bottom: 90px` que reduziam a área útil vertical do vídeo no modo Comparar.
- **Seletores compactos em pílula:** cada painel em modo Comparar usa um seletor flutuante compacto no canto superior esquerdo (`.comparison-selector-pill`) com identificação inequívoca de `Principal` (indicador luminoso verde/amarelo) e `Secundária` (indicador luminoso azul/amarelo), acompanhado por badge de mídia discreto no canto superior direito (`Com áudio` / `Tela` e `Sem áudio`). O badge de avatar redundante é suprimido durante a comparação.
- **Barra de controles unificada e enxuta:** agrupamento lógico entre ferramentas de colaboração (`Navegar`, `Ponteiro laser`, `Desenhar`, `Anotações` para apresentador; `Apontar`, `Desenhar` para espectador) e controles de visualização (`Comparar` / `Sair da comparação`, `Modo Cinema`, `PiP`, `Salvar imagem`, `Zoom`, `Tela cheia`) separados por divisor sutil.
- **Zoom simplificado:** o grupo de zoom passou de 4 controles para 3 (`-`, porcentagem interativa `100%` com ação `Restaurar enquadramento`, `+`), eliminando o ícone redundante de reset sem perder a ação rápida de restauração.
- **Convivência com o dock flutuante:** no palco tradicional, a pílula de controles posiciona-se no canto inferior direito e mantém espaçamento dinâmico acima da faixa do dock flutuante quando visível; no modo Comparar desktop, os controles da transmissão principal ficam ancorados à esquerda (`left: 12px`) e o zoom da secundária à direita (`right: 14px`), deixando o centro livre para o dock.
- **Responsividade (desktop, 390 px e 320 px):** alvos de toque de pelo menos 44 px de altura em dispositivos móveis/ponteiros grossos (`pointer: coarse`), empilhamento vertical dos painéis em telas pequenas e ausência de sobreposição ou corte horizontal até 320 px.

## Capturas com conteúdo demonstrativo representativo

Capturas geradas pelo teste `F22 comparison is local, follows only primary and
recovers lifecycle` com conteúdo demonstrativo realista e proporções distintas:
IDE/terminal com código e saída de testes em `1280×720` (16:9) e aplicação web de
telemetria/analytics em `960×720` (4:3) e `1024×640` (16:10). Desktop: `1440×900`.
Mobile validado em `390×844` e `320×740` (com toque habilitado; altura expandida
para 1500 px apenas no instante da foto para exibir os dois painéis empilhados).

### Modo Comparar (Espectador — Desktop, 390 px e 320 px)

| Largura | Duas ativas (16:9 vs 4:3) | Secundária pausada |
| --- | --- | --- |
| Desktop (`1440×900`) | [Ativas](f22-desktop-active.png) | [Pausada](f22-desktop-paused.png) |
| Mobile (`390 px`) | [Ativas](f22-mobile-390-active.png) | [Pausada](f22-mobile-390-paused.png) |
| Mobile (`320 px`) | [Ativas](f22-mobile-320-active.png) | [Pausada](f22-mobile-320-paused.png) |

### Palco tradicional, Apresentador local, Cinema e Tela cheia

| Cenário | Captura |
| --- | --- |
| Palco tradicional com múltiplas transmissões (Desktop) | [Palco tradicional — Desktop](f22-desktop-traditional-multi.png) |
| Palco tradicional com múltiplas transmissões (Mobile 390 px) | [Palco tradicional — 390 px](f22-mobile-390-traditional-multi.png) |
| Palco tradicional com múltiplas transmissões (Mobile 320 px) | [Palco tradicional — 320 px](f22-mobile-320-traditional-multi.png) |
| Apresentador local com todas as ferramentas no palco tradicional | [Apresentador — Palco tradicional](f22-desktop-presenter-traditional.png) |
| Apresentador local no modo Comparar (Principal local + Secundária remota) | [Apresentador — Modo Comparar](f22-desktop-presenter-compare.png) |
| Modo Comparar em Modo Cinema | [Modo Comparar — Cinema](f22-desktop-cinema.png) |
| Modo Comparar em Tela cheia | [Modo Comparar — Tela cheia](f22-desktop-fullscreen.png) |

## Testes específicos e regressão

| Comando | Resultado |
| --- | --- |
| `.agent/skills/impeccable/scripts/impeccable detect --json apps/web/src/features/room/components/RoomStage.tsx apps/web/src/features/room/components/Icons.tsx` | `[]` (0 anti-patterns) |
| `pnpm typecheck` | Passou |
| `pnpm test` | 237 passaram: protocol 16, signaling 90, web 131 |
| `pnpm build` | Passou |
| `pnpm --filter @screen-room/web exec playwright test apps/web/e2e/follow.spec.ts -g "F22"` | 3 passaram (desktop, mobile-390, mobile-320) |
| `pnpm --filter @screen-room/web exec playwright test apps/web/e2e/viewing-modes.spec.ts apps/web/e2e/zoom.spec.ts` | 9 passaram |
| `pnpm --filter @screen-room/web exec playwright test apps/web/e2e/sharing.spec.ts -g "Annotations menu layout\|F30 screenshot controls\|F22"` | 6 passaram |

## Limitações

Chromium headless com captura de canvas demonstrativo e áudio sintético. PiP usa
um mock da API nativa para validar seu ciclo de vida; screenshot gera um
download PNG real. Fullscreen usa a API do navegador headless. Não foram
testados seletor e permissões nativos, áudio real da aba/sistema, autoplay em
dispositivos reais, Safari/iOS/Android reais, conectividade STUN/TURN entre
redes distintas nem impacto de desempenho em hardware real. O mobile é emulado
no Chromium.
