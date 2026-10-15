# Refinamento visual da prévia — PR #10

Revisão em 15/10/2026 na branch `feat/f01-f02-quality`. O PR implementa a apresentação compacta aprovada, a configuração padrão de 30 FPS e a correção estrutural do tremor na alternância de qualidade.

## 1. Direção visual aprovada

A composição foi reorganizada na sequência estabelecida pelo produto:
1. **Vídeo de pré-visualização dominante:** player com `aspect-ratio: 16 / 9`, `object-fit: contain` e altura proporcional à viewport (`max-height: min(38dvh, 320px)`), destacando o conteúdo capturado.
2. **Estado da transmissão e áudio:** indicação clara de estado privado ("Não está ao vivo" / "Entrando ao vivo…") e disponibilidade de áudio da aba/sistema com ícones dedicados.
3. **Resumo da qualidade selecionada:** exibição permanente e síncrona da prioridade, perfil, FPS e limites técnicos:
   - Exemplo padrão: **Nitidez · Equilibrado · 30 FPS** / `1080p · 3 Mbps`
   - O resumo atualiza em tempo real a cada alteração efetuada nos controles.
4. **Ação Alterar qualidade:** botão acessível que expande/recolhe os controles de prioridade visual (Nitidez / Fluidez), nível de qualidade (Econômico / Equilibrado / Ultra) e limite de FPS (20 / 30 / 60 conforme a matriz) no próprio modal.
   - Os controles iniciam recolhidos por padrão e permanecem acessíveis antes da publicação.
   - Não há abertura de segundo modal.
   - Na substituição de origem (F27), o resumo técnico permanece visível, mas a edição de qualidade fica desativada conforme os requisitos do produto.
5. **Rodapé com ações:** botões de altura 44 px para "Cancelar" e "Entrar ao vivo" (ou "Confirmar troca" em F27), mantidos fora da área de rolagem.

Os detalhes técnicos adicionais (resolução desejada, captura observada reportada por `getSettings()` e aviso de limites do navegador/rede) ficam acessíveis sob a seção recolhível **Detalhes da captura**.

## 2. Mudança do padrão para 30 FPS

O valor padrão `DEFAULT_QUALITY` em `packages/protocol/src/quality.ts` foi atualizado para:
- `priority: 'sharpness'`
- `profile: 'balanced'`
- `fps: 30`

A alteração foi propagada de forma consistente em protocol, captura, prévia, envio e interfaces. A opção de 20 FPS permanece disponível manualmente para a prioridade Nitidez em todos os perfis. A matriz de resoluções, bitrates e combinações aprovadas foi integralmente preservada:
- Nitidez: Econômico (720p / 1,6 Mbps / 20 ou 30 FPS), Equilibrado (1080p / 3 Mbps / 20 ou 30 FPS), Ultra (1440p / 6 Mbps / 20 ou 30 FPS).
- Fluidez: Econômico (720p / 2 Mbps / 30 FPS), Equilibrado (720p / 4 Mbps / 30 ou 60 FPS), Ultra (1080p / 8 Mbps / 30 ou 60 FPS).

## 3. Investigação e correção do tremor (jitter)

### Causa identificada
1. **Centralização vertical do Mantine Modal (`centered`):** o modal utilizava a propriedade `centered`, que aplica flexbox `align-items: center` no contêiner da sobreposição. Sob centralização vertical, qualquer variação de altura $\Delta H$ em elementos filhos desloca o topo do modal por $-\Delta H / 2$.
2. **Entrada e saída assíncrona da mensagem de status:** ao alternar prioridade visual (Nitidez <-> Fluidez), a aplicação de constraints no track de vídeo é assíncrona. Durante o processamento, `qualityPending` tornava-se `true` e inseria `<Text>Aplicando qualidade…</Text>` no contêiner `[role="status"]`, cuja altura passava de 0 px para ~17 px. Esse incremento empurrava o modal ~8,4 px para cima. Ao término da aplicação das constraints (200–400 ms depois), o texto era removido e a altura retornava a 0 px, fazendo o modal saltar ~8,4 px para baixo.
3. **Expansão/retração dos controles:** sob `centered`, a abertura dos seletores ao clicar em "Alterar qualidade" aumentava a altura em ~94 px, deslocando o modal ~47 px para cima e retirando o botão de ação da posição do cursor.

### Correção estrutural
1. **Ancoragem vertical estável (`yOffset`):** substituição de `centered` por `yOffset="max(4dvh, 20px)"`. O modal é ancorado confortavelmente próximo ao topo da viewport com centralização horizontal. Quando os controles são expandidos ou recolhidos, a expansão ocorre exclusivamente para baixo; a coordenada vertical superior $y$ do diálogo, do cabeçalho, do vídeo e do botão "Alterar qualidade" permanece rigorosamente constante ($\Delta y = 0$). O botão permanece sob o cursor e o foco de teclado não é perdido.
2. **Reserva de altura no contêiner de status:** a classe `.statusArea` recebeu `min-height: 22px; display: flex; align-items: center;`. Durante todo o ciclo assíncrono de aplicação de constraints, a presença ou ausência da mensagem "Aplicando qualidade…" não altera a altura do contêiner ($\Delta H = 0$), eliminando qualquer deslocamento ou oscilação vertical.
3. **Estabilidade de rolagem:** `.scrollArea` recebeu `scrollbar-gutter: stable;` para impedir reflow horizontal ou deslocamento de conteúdo ao surgir a barra de rolagem em telas compactas.
4. **Proteção dimensional do vídeo:** dimensão travada por `aspect-ratio: 16 / 9` e `max-height` proporcional à viewport, impedindo oscilações provocadas por alterações de dimensões nativas da track.
5. **Teste de regressão automatizado:** adição do teste `Preview modal maintains visual stability and zero tremor during async quality transitions` em `apps/web/e2e/sharing.spec.ts`. O teste injeta constraints assíncronas com atraso artificial e valida via Playwright que as coordenadas $y$ do diálogo e do vídeo variam menos de 0,1 px entre os estados recolhido, expandido, pendente e estabilizado.

## 4. Evidências visuais

Capturas do navegador Chromium geradas pelos testes E2E com fonte canvas sintética, inspecionadas diretamente:

| Viewport | Estado padrão (recolhido, 30 FPS) | Detalhes da captura abertos | Controles expandidos (qualidade alterada) | Troca de tela (F27) |
| --- | --- | --- | --- | --- |
| 1280 × 800 (Desktop) | [Desktop](desktop.png) | [Detalhes](desktop-details.png) | [Fluidez / Ultra / 60 FPS](desktop-quality.png) | [Troca desktop](desktop-switch.png) |
| 390 × 844 (Mobile) | [Mobile](mobile.png) | [Detalhes](mobile-details.png) | [Fluidez / Ultra / 60 FPS](mobile-quality.png) | — |
| 320 × 640 (Mobile compacto) | [Mobile 320](mobile-320.png) | [Detalhes](mobile-320-details.png) | [Fluidez / Ultra / 60 FPS](mobile-320-quality.png) | [Troca 320 px](mobile-320-switch.png) |

## 5. Skill Impeccable

Utilizada a skill Impeccable local (`.agent/skills/impeccable/SKILL.md`):
- Leitura de diretrizes de craft floor e polish (`polish.md` e `craft-floor.md`).
- Execução do detector mecânico Impeccable nos arquivos de UI modificados (`CapturePreview.tsx` e `CapturePreview.module.css`), retornando `[]` (zero defeitos).
- Avaliação crítica e inspeção visual das capturas renderizadas para composição, proporções, densidade, contraste, acessibilidade e alinhamento responsivo.
- Verificação de navegação por teclado (tabulação lógica através de controles e disclosures) e interação por toque no mobile.

## 6. Verificações

- `pnpm --filter @screen-room/signaling... build`: aprovado (protocol + signaling compilados).
- `pnpm test`: 140 aprovados (9 protocol, 65 signaling, 66 web).
- `pnpm typecheck`: aprovado (0 erros em todo o workspace).
- `pnpm build`: aprovado sem erros.
- `pnpm --filter @screen-room/web test:e2e`: todos os cenários da suíte aprovados, incluindo os testes de sincronização em 1280 px, 390 px e 320 px, serialização rápida e o teste de regressão de estabilidade visual.
- Detector Impeccable: `[]` em todos os alvos.
