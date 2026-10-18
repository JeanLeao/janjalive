# F22 — ferramentas laterais recolhíveis

Correção do PR #25, na branch `feat/f22-simultaneous-view`. Substitui o posicionamento horizontal e os cálculos de colisão com o dock por uma coluna absoluta em cada painel de vídeo. O dock de transmissão permanece inalterado.

A barra mede 48 px no desktop e 56 px em telas pequenas/toque; os alvos de toque medem pelo menos 44 × 44 px. O acionador fica fora da rolagem interna. Colaboração, visualização e zoom seguem a ordem do teclado. Recolher retorna a ferramenta para navegação e preserva zoom e enquadramento. Cada painel mantém seu próprio estado. A secundária continua silenciada e oferece somente zoom/navegação.

O CSS reserva as faixas superior (identificação/seletores) e inferior (ações de sessão); não há medição do dock, `ResizeObserver` ou `--stage-dock-clearance`. Na comparação empilhada, o viewport rolável termina acima da faixa inferior, com painéis de no mínimo 420 px. Em desktop, o painel de interações aberto possui espaço próprio ao lado da barra. Em telas estreitas, feche o painel de interações para voltar às ferramentas do vídeo.

## Evidências

As capturas são de viewports reais, sem ampliar a altura para acomodar os painéis. Na comparação mobile, role para acessar o segundo painel. Fontes sintéticas: IDE/terminal 16:9 e navegador 4:3; os testes usam WebRTC local entre contextos de navegador.

| Largura × altura | Tradicional / apresentador | Comparação | Recolhida |
| --- | --- | --- | --- |
| 1440 × 900 | [Abrir](traditional-expanded-1440.png) | [Abrir](comparison-expanded-1440.png) | [Abrir](traditional-collapsed-1440.png) |
| 1024 × 900 | [Abrir](traditional-expanded-1024.png) | [Abrir](comparison-expanded-1024.png) | [Abrir](traditional-collapsed-1024.png) |
| 768 × 900 | [Abrir](traditional-expanded-768.png) | [Abrir](comparison-expanded-768.png) | [Abrir](traditional-collapsed-768.png) |
| 600 × 900 | [Abrir](traditional-expanded-600.png) | [Abrir](comparison-expanded-600.png) | [Abrir](traditional-collapsed-600.png) |
| 390 × 900 | [Abrir](traditional-expanded-390.png) | [Abrir](comparison-expanded-390.png) | [Abrir](traditional-collapsed-390.png) |
| 320 × 900 | [Abrir](traditional-expanded-320.png) | [Abrir](comparison-expanded-320.png) | [Abrir](traditional-collapsed-320.png) |

Outros estados por largura: `viewer-traditional-*`, `viewer-comparison-*`, `comparison-collapsed-*`, `cinema-expanded-*`, `cinema-collapsed-*`, `fullscreen-expanded-*`, `fullscreen-collapsed-*` e `resized-expanded-*` (altura de 600 px). As capturas `landscape-*` usam 844 × 390.

## Validação

- `pnpm --filter @screen-room/signaling... build`: passou (preparação).
- `pnpm typecheck`: passou; Node.js 22.23.3 e pnpm 12.6.0.
- `pnpm test`: 237 testes passaram (16 protocol, 90 signaling, 131 web).
- `pnpm build`: passou. Avisos existentes de diretivas de módulo em dependências Mantine; sem erro de compilação.
- Impeccable `detect --json apps/web/src/features/room/components/RoomStage.tsx`: `[]`.
- `pnpm --filter @screen-room/web test:e2e`: 92/101 passaram na primeira execução. Essa rodada atravessou refinamentos e houve recarregamentos do Vite; não representa aprovação integral da versão final.
- Rodada serial pertinente (`--workers=1 --grep 'F22|Cinema preserves|polls:|F38 Q&A|F29 automatic|F29 rapid|late join and a presenter|Annotations menu layout|F13|F30|F21|PiP'`): 36/40 passaram. Falharam F29 automático, nove espectadores, laser (contexto destruído por navegação) e 1024 px (recepção de frames).
- Repetição isolada com artefatos fora da árvore observada (`--workers=1 --output=/tmp/f22-final-results --grep 'F29 automatic|late join and a presenter|F13 laser|F22 collapsible'`): 7/9 passaram. **Laser e a matriz completa 1440/1024/768/600/390/320 passaram**. A matriz cobre palco tradicional, comparação, apresentador/espectador, dock visível, Cinema, fullscreen, zoom, anotação, recolhimento, foco, teclado, toque, redimensionamento e orientação 844 × 390.
- Menus de anotações em 1280/390/320, screenshot, PiP, Cinema, perguntas e enquetes passaram na rodada pertinente. [Menu em 320 px](menu-320.png), [menu em fullscreen 320 px](fullscreen-menu-320.png).

### Falhas restantes e controle comparativo

As duas falhas persistentes também foram reproduzidas com os três arquivos de código/teste restaurados temporariamente do HEAD de referência **`e89acd2566067710d42b0d9c8e949fd408ce19fc`**, executando os mesmos testes em série, sem build concorrente e com resultados em `/tmp`. Os arquivos da correção foram restaurados ao terminar.

1. **F29 automático / entrada tardia:** o helper espera um botão `Compartilhar tela` habilitado na página de entrada tardia; o botão não aparece em 5 s. Mesmo erro no HEAD de referência. Houve uma execução serial aprovada com a correção (48,7 s); a causa da intermitência permanece não isolada.
2. **Um apresentador + nove espectadores:** o helper `frames()` não confirma recepção/apresentação em 5 s. Mesmo erro no HEAD de referência. Houve execuções isoladas aprovadas tanto na referência (9,4 s) quanto na correção (9,4 s), além de falhas. Traces de algumas tentativas registram navegação/recarregamento ou ausência de vídeo/conexões na página que falha. Isso não comprova uma causa única.

Essas falhas não foram ocultadas com aumento de timeout, mudança de mídia ou exclusão de cenários. A suíte E2E inteira não ficou verde nesta sessão. Os cenários da nova barra e a verificação visual foram aprovados pelo agente; aprovação visual do proprietário continua pendente.

## Limitações

Captura de tela e áudio sintéticos não comprovam permissões nativas, áudio real de aba/sistema, autoplay em dispositivos reais ou conectividade STUN/TURN entre redes distintas. PiP é mockado nos testes específicos. Fullscreen é exercitado no Chromium headless; teclado e toque são simulados pelo Playwright. A implementação aguarda aprovação visual do proprietário. Sem merge ou deploy.
