# Refinamento visual da prévia — PR #10

Revisão em 15/10/2026 na branch `feat/f01-f02-quality`. O resultado aguarda aprovação visual do proprietário antes do merge.

## Decisões visuais

A composição segue **prévia dominante → configuração compacta → ações claras**, preservando cores, tipografia, bordas e botões da aplicação. O vídeo usa `object-fit: contain`, sem recortar a fonte, com altura limitada proporcionalmente ao viewport. O estado privado e a disponibilidade de áudio ficam imediatamente abaixo dele.

No desktop, prioridade, qualidade e FPS ocupam uma única linha alinhada pela base. Nos celulares, prioridade ocupa a primeira linha e os dois seletores dividem a segunda. O rótulo visual “Qualidade” evita quebra em 320 px; o nome acessível continua “Nível de qualidade”. A gaveta de Configurações mantém sua apresentação detalhada.

O resumo permanente mostra a configuração desejada, como **1080p · 20 FPS · 3 Mbps**. “Detalhes” expande prioridade/perfil, resolução desejada, captura observada e ressalvas sobre fonte/navegador/rede. Esses números continuam sendo limites desejados, sem promessa de resolução efetivamente enviada ou recebida. Avisos de falha parcial e aplicação pendente permanecem fora do conteúdo recolhido.

Há uma única região de conteúdo rolável e um rodapé separado, com botões de 44 px. O estado padrão cabe sem rolagem nas três dimensões solicitadas. Em telas pequenas com detalhes abertos, a rolagem é intencional e mantém as ações acessíveis. Não houve alteração de captura, protocolo, negociação, concorrência, matriz de qualidade, proteção de rede ou pausa/retomada. F27 continua sem editar qualidade durante a substituição.

## Evidências

Capturas do navegador com fonte canvas sintética, inspecionadas diretamente. As cores sólidas e o quadrado branco fazem parte da fonte de teste, não da interface.

| Viewport | Estado padrão | Detalhes abertos | Qualidade alterada |
| --- | --- | --- | --- |
| 1280 × 800 | [Desktop](desktop.png) | [Detalhes](desktop-details.png) | [Fluidez / Ultra / 60 FPS](desktop-quality.png) |
| 390 × 844 | [Mobile](mobile.png) | [Detalhes](mobile-details.png) | [Fluidez / Ultra / 60 FPS](mobile-quality.png) |
| 320 × 640 | [Mobile compacto](mobile-320.png) | [Detalhes](mobile-320-details.png) | [Fluidez / Ultra / 60 FPS](mobile-320-quality.png) |

A revisão visual considerou a composição completa, hierarquia, densidade, alinhamento, proporção do vídeo, legibilidade, contraste e acesso às ações. O refinamento mantém a identidade existente; a prévia passa a ser o maior elemento e os textos técnicos deixam de competir com os controles. Os E2E verificam ausência de overflow horizontal, foco, teclado, toque e publicação; também abrem os detalhes e conferem que a captura observada pode ser trazida à área visível sem ficar atrás do rodapé.

## Skill

Utilizada a Impeccable local (`.agent/skills/impeccable/SKILL.md`): carregamento de contexto, referências `polish.md` e `craft-floor.md`, avaliação crítica das capturas, uma rodada de refinamento e confirmação visual nos três tamanhos. O detector mecânico executado nos três arquivos de UI retornou `[]`; esse resultado não substituiu a inspeção visual.

## Verificações

- `pnpm --filter @screen-room/signaling... build`: aprovado.
- `pnpm test`: 140 aprovados (9 protocol, 65 signaling, 66 web).
- `pnpm typecheck`: aprovado.
- `pnpm build`: aprovado; avisos de diretivas de dependências do bundler, sem erro de compilação.
- `pnpm --filter @screen-room/web test:e2e`: **56 aprovados em 2,6 minutos**, 3 workers, sem alterações nas fontes ou build concorrente.
- `git diff --check`: aprovado.
- Detector Impeccable: `[]` nos três arquivos de UI.

Antes da edição, os três E2E de seleção/privacidade/sincronização passaram no HEAD original. Na primeira rodada após a edição, 2/4 passaram: o desktop falhou no observador de frames e o caso de 320 px excedeu o tempo. Essa rodada coincidiu com build e edições que dispararam HMR; o log do caso de 320 px registra reinicialização de sessões por hot reload. Não há classificação dessas falhas como preexistentes nem atribuição definitiva do timeout de frames. Após concluir build e edições, a suíte completa passou com fontes estáveis, sem aumentar timeouts, adicionar retries ou desabilitar cenários.

A suíte final cobre controles válidos, seleção rápida, falha parcial, aplicação pendente, publicação por teclado/toque, privacidade, sincronização com Configurações e F27. Também passaram início/parada/reinício, entrada tardia, múltiplos apresentadores, reconexão, limpeza e operações fora de ordem. [Troca de origem desktop](desktop-switch.png) · [Troca de origem em 320 × 568](mobile-320-switch.png).

## Limitações

Captura sintética e WebRTC local no Chromium. Esta revisão visual não repetiu medições nativas, permissões do seletor do sistema, áudio real, autoplay real, redes distintas/STUN/TURN, Firefox/Safari ou leitor de tela real. As evidências nativas anteriores permanecem no [relatório funcional anterior](../preview-quality/README.md) e não são apresentadas como novas validações deste refinamento.
