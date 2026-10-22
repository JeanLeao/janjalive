# F14 — resumo da inspeção visual

A reconstrução visual recebeu aprovação explícita do proprietário para o HEAD `b2db2a2472028ff850823419867fb24a4ba8ec2d`, conforme o handoff de limpeza final do PR #38 em 21/10/2026. Merge e deploy não estão autorizados.

A inspeção ocorreu na aplicação real em Chromium, com mídia sintética, em 1280, 768, 390 e 320 px. Cobriu sala vazia, preparação, vídeo horizontal/vertical e claro/escuro, convite, transferência, controlador/espectador, zero/um/vários espectadores, participantes, confirmação, Cinema/fullscreen, chat, teclado/retorno de foco e toque emulado. Foram inspecionadas 75 capturas finais.

Os 20 PNGs selecionados para revisão foram retirados do versionamento, com cópias locais preservadas. Este documento mantém o resumo sem depender de links para imagens locais.

Validações anteriores: `pnpm typecheck`, `pnpm test` (366/366) e `pnpm build` passaram; F14 funcional/visual teve 9/9 E2E e as regressões direcionadas tiveram 35/35, totalizando 44 cenários distintos aprovados em rodadas separadas. Veja [validações, ocorrências e limitações](../../F14.md#validação-desta-reconstrução).

Chromium headless e toque emulado não comprovam permissões nativas, áudio real de aba/sistema, hardware móvel, leitores de tela, Safari/iOS/Firefox ou STUN/TURN entre redes. A limpeza documental não reexecutou a suíte da aplicação.
