# Qualidade na pré-visualização — refinamento do PR #10

Validação em 15/10/2026, branch `feat/f01-f02-quality`.

## Comportamento

A prévia inicial permite escolher Nitidez/Fluidez, Econômico/Equilibrado/Ultra e somente FPS válidos. O padrão continua Nitidez · Equilibrado · 20 FPS. `QualityControls.tsx` é compartilhado com a gaveta de Configurações e usa a matriz e normalização existentes de protocol.

As mudanças aplicam constraints à track já capturada; não abrem novamente o seletor nem anexam mídia aos peers. A confirmação fica desabilitada durante a aplicação, com uma barreira síncrona também no handler. Mudanças rápidas continuam serializadas por track e pela fila existente do PeerManager; somente a operação mais recente pode atualizar feedback. Encerrar a captura ou a sessão invalida o feedback pendente e libera a confirmação de uma captura posterior, mesmo que uma operação antiga ainda não tenha retornado. Mudanças durante publicação/restauração não alteram a seleção em trânsito.

O resumo distingue resolução desejada do perfil e captura observada via `getSettings()`. Nenhum desses valores promete a resolução codificada ou recebida. Falhas parciais aparecem na própria prévia e permitem continuar com os limites disponíveis ou escolher outro perfil. Durante a transmissão, o feedback da gaveta continua por toast. Na substituição F27, há somente o resumo e a captura observada; confirmação, cancelamento, pausa, áudio e restauração mantêm seus fluxos.

O vídeo continua acima dos controles, com altura limitada em telas baixas. As ações têm 44 px de altura e rodapé separado da área rolável; o conteúdo do modal pode rolar sem cobrir status ou ações. Os seletores nativos têm rótulos e altura mínima de 44 px; prioridade mantém radios e navegação por setas. O status de aplicação usa região viva. As verificações automatizadas exercitam foco, Tab, setas, Enter, toque, área de interação e ausência de overflow horizontal.

## Resolução nativa: padrão 1080p → Ultra 1440p

Executado `QUALITY_REPORT=/tmp/preview-native-before.json node docs/validation/native-quality.mjs`, com Vite em 4311. Chromium 156.0.8078.4 em modo gráfico, aba dedicada de 2560 × 1440 com texto e canvas em movimento, captura nativa por `getDisplayMedia()` e WebRTC loopback real. [Dados sanitizados](native.json).

A captura abriu com o padrão Equilibrado/20 FPS e observou 1920 × 1080. A mesma track passou por Econômico, Equilibrado e Ultra, sem recaptura. Em Nitidez/Ultra/30 FPS, `getSettings()` observou 2560 × 1440, e tanto outbound quanto inbound reportaram 2560 × 1440. Portanto, neste ambiente não foi constatado bloqueio de resolução pela captura inicial. As constraints iniciais foram preservadas; não foi adicionado envelope de resolução nem recaptura. O envelope de FPS previamente aprovado permanece.

Essa medição é curta e restrita ao Chromium/aba: não garante comportamento de todas as fontes, monitores, janelas ou navegadores. Fontes menores continuam menores; a prévia apresenta o valor observado separadamente. Não foram repetidas medições extensas de qualidade ou rede.

## Verificações

- `pnpm --filter @screen-room/signaling... build`: aprovado, preparação dos builds importados pelos testes.
- `pnpm typecheck`: aprovado.
- `pnpm test`: 140 aprovados (9 protocol, 65 signaling, 66 web).
- `pnpm build`: aprovado. Avisos do bundler sobre diretivas de dependências não impediram a compilação.
- `pnpm --filter @screen-room/web test:e2e --workers=1`: 56 aprovados em 2,8 minutos na execução final.
- `git diff --check`: aprovado.

Os quatro novos E2E cobrem o padrão na prévia, prioridade/perfil/FPS e normalização, sincronização com Configurações, ausência de recaptura e envio antes da confirmação, mudança pendente, seleção rápida/obsoleta, falha parcial, cancelamento/limpeza e nova captura antes da resolução antiga, resumo F27 e restauração, resolução desejada versus observada, foco/teclado/toque e layout nos três tamanhos. Os E2E existentes exercitam publicação, pausa, reinício, entrada tardia, múltiplos apresentadores, reconexão e corridas F27.

Intercorrências: na primeira rodada focada, 5/6 passaram; o teste F01/F02 de desktop excedeu os 5 s do observador de frames logo após iniciar a transmissão. Uma rodada completa intermediária foi interrompida após 21 aprovados e 2 falhas no mesmo observador (nove espectadores e apresentador chegando durante a prévia); houve uma execução F27 interrompida e 32 casos não executados. Essa rodada coincidiu com build e ajustes locais/HMR, portanto foi substituída por uma execução completa com fontes estáveis e sem build concorrente. Não há evidência comparativa suficiente para classificar os timeouts como preexistentes nem atribuí-los definitivamente à carga. Na execução completa seguinte, 55/56 passaram: o caso novo exigia equivocadamente 60 FPS aplicados a uma fonte canvas cuja capacidade nativa é 20 FPS. A expectativa foi corrigida para distinguir seleção de capacidade, e os quatro casos novos passaram na repetição focada (14,8 s), incluindo cancelamento seguido de nova captura com a aplicação anterior ainda pendente. A confirmação visual também levou à separação entre conteúdo rolável e rodapé para evitar sobreposição de texto/foco em telas baixas. A execução final, sem build ou alterações concorrentes, aprovou os 56 E2E em 2,8 minutos, incluindo os dois cenários que haviam excedido o observador de frames. Não foram alterados timeouts, adicionados retries ou desabilitados cenários para obter esse resultado.

## Evidências visuais

- [Desktop 1280 × 800](desktop.png)
- [Mobile 390 × 844](mobile.png)
- [Mobile 320 × 640](mobile-320.png)

Capturas sintéticas usadas nos E2E, com seleção Fluidez · Ultra · 60 FPS. A fonte sintética é 640 × 360: a diferença em relação à resolução desejada é intencional e verificável no resumo. Inspeção com Impeccable preservou a linguagem visual existente; detector mecânico sem findings. Não foi realizado teste com leitor de tela real.

## Limitações

Os E2E usam captura sintética e WebRTC real local. Não validam permissões nativas manuais, áudio real de aba/sistema, autoplay real ou conectividade entre redes/STUN/TURN. A captura nativa acima usa seleção automatizada de uma aba de teste. Firefox e Safari não foram medidos nativamente nesta correção. Ultra continua sujeito aos custos de upload/processamento do mesh. Sem merge ou deploy.


## Arquivos desta correção

- `apps/web/src/features/room/components/QualityControls.tsx`: controles e resumo compartilhados.
- `apps/web/src/features/room/components/CapturePreview.tsx`: edição compacta, captura observada, status e rodapé.
- `apps/web/src/features/room/components/SettingsDrawer.tsx`: reutiliza controles e normalização.
- `apps/web/src/features/room/hooks/useRoomSession.ts`: aplicação, barreira de confirmação e invalidação assíncrona.
- `apps/web/src/routes/room.$roomId.tsx`: conecta estado compartilhado às prévias inicial e F27.
- `apps/web/e2e/sharing.spec.ts`: quatro casos novos e falha de constraints controlável na fonte sintética.
- `docs/validation/preview-quality/README.md`, `native.json`, `desktop.png`, `mobile.png`, `mobile-320.png`: relatório, dados e evidências.

`display-media.ts`, a matriz de `packages/protocol/src/quality.ts` e o protocolo não precisaram de alteração. Arquivos locais preexistentes em `.agent/`, `.impeccable/` e `screenshots/` foram preservados e não fazem parte do commit.
