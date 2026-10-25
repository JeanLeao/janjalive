# F14 — verificação documental final

Escrito somente este registro local. DESIGN.md e .impeccable/design.json globais não foram criados: a entrega é uma extensão ordinária do mundo Screen Room, sem autorização de mudança do sistema. Nenhum arquivo de código ou documento rastreado foi alterado por este passe.

Passe executado por agente independente comum com o contrato de `reference/degraded/documenter.md`; não foi usado um tipo custom de documenter. O caminho indicado como `degraded/documenter.md` foi resolvido para `.agent/skills/impeccable/reference/degraded/documenter.md`.

## Fontes e evidência

Lidos `reference/document.md`, contrato do documenter, `.impeccable/f14/direction.md`, `apps/web/PRODUCT.md`, `WatchParty.tsx`, `WatchParty.module.css`, ramo Watch Party e retorno de foco de `RoomStage.tsx`, `apps/web/src/theme.ts`; amostrados `ClipControls.tsx`/CSS, `RoomHeader.tsx` e `RoomInteractions.tsx`/CSS. Foram preservadas as alterações locais preexistentes indicadas por `git status --short`.

As 25 capturas de `.impeccable/review/f14/` estão presentes. Este passe abriu diretamente seis: `empty-1280.png`, `horizontal-paused-768.png`, `vertical-320.png`, `error-320.png`, `chat-desktop.png`, `participants-320.png`. As demais contam com a revisão independente registrada em `finish-review.md`; as seis recapturas corretivas contam com `finish-verdict.md`. Não se afirma nova inspeção visual integral das 25 neste passe.

## Resumo do sistema em cinco linhas

1. Paleta: palco #080a0f, superfície #161b22, texto #e6edf3, ação #2563eb e foco #58a6ff; valores presentes na extensão e nos componentes adjacentes/tema.
2. Tipografia: stack sans existente do tema, sem nova fonte; preparação 28/24px, convite 24/22px, arquivo 18px, introdução 16/14px e controles/metadados 12–15px.
3. Regra herdada de prioridade: o vídeo mantém proporção nativa (`object-fit: contain`); transporte e áudio individual compartilham uma superfície, enquanto disponibilidade fica em seção secundária.
4. Regra local de interação: controles da extensão com altura mínima de 44px; foco visível 2px #58a6ff; timeline do espectador explicitamente disabled e ranges com nomes/valor acessíveis.
5. Forma e adaptação: superfícies discretas, raios locais 8/12px, espaçamento 8–32px e reorganização em 768/440px; ícones existentes de Icons.tsx e componentes Mantine, com símbolos convencionais sólidos de play/pause.

Essas linhas descrevem o artefato; não instituem tokens ou regras globais novas.

## Comparação com o entorno

- ClipControls usa os mesmos texto claro, foco azul e superfície escura, com SVG stroke e tipografia herdada. Seu pill, blur, sombra e raios de 14px são próprios de ferramenta flutuante; a F14 usa superfície estável para o transporte. Não foi inventada uma proibição global de sombra, blur ou pills.
- RoomHeader conserva #0d1117 no cabeçalho, #161b22 nos controles e #2563eb na marca, com ícones existentes. A extensão mantém esse contexto visível e não troca a voz tipográfica.
- RoomInteractions usa #161b22, texto #e6edf3, foco #58a6ff e bordas discretas, além de raios 8/10/12/14px. `chat-desktop.png` mostra continuidade entre o player e o painel adjacente, com espaço reservado por CSS no desktop.
- Tons secundários já variam entre tema/header (#8c959f), interações (#a9b4c2) e clipes (#94a3b8); a F14 usa #a6b1bf. Essa variação foi registrada sem unificação nem promoção a uma nova escala normativa.
- O entorno já contém controles menores que 44px: ClipControls tem fallback 36px e RoomInteractions declara áreas de 32×30px, 40×38px ou 38×36px conforme ponteiro/largura. Não se declara conformidade global de toque com base nos 44px da F14, nem se repara o entorno nesta tarefa.

## Conformidade e limites

A preparação central, consentimento individual, ação azul, retorno às transmissões, autoridade do controlador, áudio local separado e disponibilidade secundária têm evidência no código e nas capturas amostradas. `vertical-320.png` mostra vídeo inteiro, timeline, reprodução, mute e volume acima do dock; `error-320.png` mostra o alerta completo e a seleção de novo arquivo. A navegação está parcialmente rolada nesta última captura, como reconhecido no verdict. `horizontal-paused-768.png` confirma espaço entre “Reproduzir” e “para todos”. Os três pontos do primeiro finish-review foram declarados resolvidos pelo finish-verdict, com disposição ship limitada ao lote corretivo.

Este passe documental não executou navegador, testes ou medições computadas, nem validação nova de teclado, toque físico, leitor de tela ou contraste. A presença de atributos acessíveis e dimensões no CSS é evidência estática, não execução assistiva. Capturas com vídeo gerado e RTCDataChannel local não comprovam permissões nativas, áudio real, STUN/TURN ou redes externas. Progresso do controlador existe no código; a revisão anterior declara que `transfer-controller.png` não mostra sua lista e não comprova esse detalhe visualmente. A aprovação visual do proprietário antes de merge continua sendo compromisso do PRODUCT.md, sem merge, commit ou push realizados neste passe.

Derivas não canonizadas nem reparadas: variações preexistentes de tons, raios e áreas compactas do entorno e limitações de evidência acima permanecem registradas porque a autorização abrange somente a extensão local da UI F14.
