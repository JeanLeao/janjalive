# F38 — validação de enquetes rápidas

Capturas reais da interface local no Chromium do Playwright. A apresentação usa vídeo sintético produzido por `canvas.captureStream()` no mock de `getDisplayMedia()`. Os dados de votação são de teste.

| Captura | Estado |
| --- | --- |
| `create-desktop.png` | Apresentador preenchendo pergunta e três alternativas, desktop 1440 × 1000 |
| `results-desktop.png` | Resultados ao vivo e voto do apresentador |
| `results-mobile-320.png` | Voto confirmado, barras, números e percentuais, toque em 320 × 740 |
| `empty-mobile-320.png` | Sala sem enquete aberta |
| `pending-mobile-320.png` | Envio suspenso pelo teste, aguardando confirmação |
| `disconnected-mobile-320.png` | Conexão indisponível, antes de recuperar o voto |
| `history-mobile-320.png` | Histórico expandido com resultados finais; conteúdo continua na região rolável |
| `history-desktop.png` | Formulário de nova enquete e histórico recente |
| `create-mobile-320.png` | Formulário longo com cinco alternativas, rolado até a última alternativa e ação de criar |
| `cinema-desktop.png` | Enquete no Modo Cinema |
| `fullscreen-desktop.png` | Enquete dentro do elemento nativo em fullscreen, após a animação assentar |

A revisão visual Impeccable inspecionou as onze imagens e retornou `ship`, sem correções materiais. O detector mecânico sobre os três arquivos de UI alterados retornou `[]`. O painel herda paleta, tipografia, bordas, controles, foco e rolagem da implementação existente; não houve redesenho ou alteração de documentação do sistema visual.

## Verificações

- `pnpm --filter @screen-room/signaling... build`: passou, preparando os builds importados pelos testes.
- `pnpm typecheck`: passou.
- `pnpm test`: 237 testes passaram (16 protocol, 90 signaling, 131 web).
- `pnpm build`: passou. O bundler emitiu avisos sobre diretivas `use client` de dependências; não houve erro de build.
- `pnpm --filter @screen-room/web test:e2e interactions.spec.ts polls.spec.ts --workers=1`: 5 testes passaram, incluindo Chat, reações, Q&A e enquetes.
- `pnpm --filter @screen-room/web test:e2e polls.spec.ts --workers=1`: passou novamente após ajustar a captura de fullscreen para aguardar o fim da animação e remover o aviso temporário de entrada da captura de histórico mobile.
- `git diff --check`: passou.

Os E2E verificam teclado nas abas (setas, Home/End), Escape e devolução de foco, toque nas alternativas e confirmação de voto, área efetiva da alternativa de pelo menos 44 px em dispositivo de toque, ausência de overflow horizontal em 320 px, estado pendente, desconexão e recuperação, entrada tardia, transmissão interrompida/reiniciada, Cinema e fullscreen. Radios, fieldset/legend, labels, abas/tabpanel, região rolável e status fornecem semântica acessível; não foi usado um leitor de tela real.

## Ocorrências durante desenvolvimento

A primeira suíte completa encontrou leitores de mensagens de testes antigos que precisavam ignorar o novo snapshot de enquetes; os helpers foram atualizados, e os 237 testes passaram. O novo E2E teve uma asserção inicial sobre um rótulo oculto no mobile e um seletor ambíguo entre summary e título; ambos foram corrigidos.

Uma execução de Q&A expirou ao procurar seu campo de pergunta após o painel desaparecer, durante uma rodada em que arquivos da UI ainda eram editados com o Vite ativo. A rodada seguinte, sem edições concorrentes, passou os cinco E2E (40,3 s). Isso não foi classificado como falha preexistente; não houve comparação com uma cópia da base. Uma captura inicial de fullscreen ocorreu antes de a renderização assentar; o teste passou a aguardar `transform: none` e focar a aba antes da captura final.

## Limitações

Validação de navegador em Chromium headless, com mobile/toque emulados. Cinema e fullscreen foram exercitados em desktop. Não foram verificados leitor de tela real, hardware móvel, Firefox/WebKit, permissões nativas de captura, áudio real, autoplay de áudio nem conectividade STUN/TURN entre redes distintas. A arquitetura e o transporte de mídia não foram alterados.

A identidade é efêmera: reconexão válida preserva o voto, mas uma nova identidade pode votar novamente. O servidor limita a memória a 10.000 identidades por enquete; novos votantes recebem recusa ao atingir o teto, e escolhas existentes ainda podem mudar. Percentuais são arredondados de forma independente.
