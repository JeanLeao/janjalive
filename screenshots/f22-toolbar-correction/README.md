# F22 — correção da barra de ferramentas do palco

A barra `stage-view-controls` inicia expandida. O acionador mantém o foco ao recolher/expandir e os controles recolhidos saem do DOM e do percurso de Tab. Recolher cancela a ferramenta de anotação ativa, preservando o enquadramento e a transmissão. O estado é local ao participante e independente por painel, inclusive ao trocar a transmissão selecionada.

O posicionamento usa os retângulos reais da barra, do canvas e do dock. Quando existe espaço horizontal, alinha as bordas inferiores; quando os limites colidem, mantém 12 px de separação acima do dock. ResizeObserver e eventos de resize/scroll atualizam as medidas, incluindo mudanças de tamanho ao recolher/expandir. Fullscreen desconsidera o dock externo. O FloatingControlDock não foi alterado.

## Evidências

Capturas do Chromium/Playwright com transmissão sintética de código e terminal, compartilhamento local ativo e segundo apresentador conectado. O zoom de 125% no palco tradicional é intencional para verificar preservação do enquadramento.

| Largura | Tradicional expandida | Tradicional recolhida | Comparar expandida | Comparar recolhida |
| --- | --- | --- | --- | --- |
| 1440 px | [Imagem](traditional-expanded-1440.png) | [Imagem](traditional-collapsed-1440.png) | [Imagem](comparison-expanded-1440.png) | [Imagem](comparison-collapsed-1440.png) |
| 390 px | [Imagem](traditional-expanded-390.png) | [Imagem](traditional-collapsed-390.png) | [Imagem](comparison-expanded-390.png) | [Imagem](comparison-collapsed-390.png) |
| 320 px | [Imagem](traditional-expanded-320.png) | [Imagem](traditional-collapsed-320.png) | [Imagem](comparison-expanded-320.png) | [Imagem](comparison-collapsed-320.png) |

| Largura | Cinema expandida | Cinema recolhida | Fullscreen expandida | Fullscreen recolhida |
| --- | --- | --- | --- | --- |
| 1440 px | [Imagem](cinema-expanded-1440.png) | [Imagem](cinema-collapsed-1440.png) | [Imagem](fullscreen-expanded-1440.png) | [Imagem](fullscreen-collapsed-1440.png) |
| 390 px | [Imagem](cinema-expanded-390.png) | [Imagem](cinema-collapsed-390.png) | [Imagem](fullscreen-expanded-390.png) | [Imagem](fullscreen-collapsed-390.png) |
| 320 px | [Imagem](cinema-expanded-320.png) | [Imagem](cinema-collapsed-320.png) | [Imagem](fullscreen-expanded-320.png) | [Imagem](fullscreen-collapsed-320.png) |

## Limites da validação

Captura, toque e teclado foram exercitados por automação no Chromium. Isso não comprova permissões nativas, captura de áudio real, PiP nativo, leitor de tela, dispositivos físicos ou conectividade STUN/TURN entre redes distintas. A correção permanece sujeita à aprovação visual do proprietário, sem merge ou deploy.

## Verificações executadas

- `pnpm --filter @screen-room/signaling... build`: passou (preparação dos testes).
- `pnpm typecheck`: passou.
- `pnpm test`: 237 testes passaram (16 protocol, 90 signaling, 131 web).
- `pnpm build`: passou; avisos do bundler sobre diretivas de módulos de dependências.
- `pnpm --filter @screen-room/web test:e2e --workers 1 --grep 'F22|Annotations menu|F30|zoom|F38 Q&A|polls:|late join and a presenter'`: 24 passaram, incluindo F22/F29, zoom/arraste, anotações, screenshot, Cinema e PiP.
- Após o ajuste final de quebra de linha em mobile: seleção de 10 testes de layout, entrada e Cinema; nove passaram, com timeout no teste de anotações de 1280 px. O trace registra atualizações HMR e reinicialização da sessão durante o build concorrente. Reexecução isolada registrada abaixo.
- Impeccable: contexto e referências de refinamento consultados; detector mecânico sem achados.
- `git diff --check`: passou.

A tentativa ampla de 98 E2E com dois workers foi interrompida após 12 aprovações e três falhas (F38 Q&A, enquetes e nove espectadores); dois testes estavam em execução e 81 não foram executados. Os três casos falhos passaram na seleção sequencial de 24 testes. Não foram classificados como falhas preexistentes; a suíte completa não foi concluída.

Reexecução isolada: `pnpm --filter @screen-room/web test:e2e --workers 1 --grep 'Annotations menu.*1280px'`: passou (1/1), sem build concorrente.
