# Screen Room — instruções para agentes

Aplicação focada em compartilhamento de tela e áudio da aba/sistema, sem cadastro, em salas efêmeras. Priorize confiabilidade da transmissão, privacidade e simplicidade da interface.

Monorepo TypeScript: `apps/web` (interface e WebRTC), `apps/signaling` (WebSocket, presença e TURN) e `packages/protocol` (contratos e schemas compartilhados). Use Node.js 22+ e `pnpm` na raiz, com a versão definida no campo `packageManager` de `package.json`.

## Ao trabalhar

- Confira o estado do Git e os arquivos locais antes de editar; não presuma equivalência com a branch remota. Preserve alterações preexistentes e arquivos não rastreados.
- Conclua o trabalho autorizado, incluindo correções e validação pertinentes. Mantenha o diff no escopo, sem refatorações, dependências ou mudanças visuais alheias ao pedido.
- Resolva detalhes locais com autonomia. Peça decisão apenas para mudanças relevantes de produto, segurança, arquitetura, contratos ou infraestrutura que excedam a autorização existente.
- Não faça commit, push, merge, deploy ou operações destrutivas de Git sem autorização explícita.
- Não edite manualmente arquivos gerados, como `apps/web/src/routeTree.gen.ts`; altere a fonte e use a geração existente.

## Invariantes a preservar

- **Mídia:** capture exclusivamente por `getDisplayMedia()`. O áudio, quando disponível, é da aba/sistema; não introduza captura de câmera, microfone ou `getUserMedia()` sem decisão explícita de produto.
- **Transporte:** mantenha WebRTC mesh P2P e a separação entre sinalização e mídia. Em produção, web e signaling são serviços distintos sob a mesma origem via proxy reverso.
- **Compartilhamento:** iniciar, parar pela interface ou pelo navegador, reiniciar, entrar tardiamente e reconectar devem funcionar sem recarregar a página. Mantenha o estado anunciado (`update-sharing` / `sharing-updated`) consistente com as tracks recebidas e preserve múltiplos apresentadores e seleção do palco.
- **Recursos e concorrência:** parar a captura encerra as tracks locais e desanexa a mídia dos senders, mantendo conexões reutilizáveis. Encerrar a sessão limpa listeners, timers, conexões e referências, inclusive quando a autorização de captura ainda está pendente. Ao alterar negociação ou recuperação, preserve proteção equivalente contra ofertas concorrentes e ofertas, respostas ou ICE obsoletos; não remova rollback, serialização ou controle de gerações sem verificar os cenários que protegem.
- **Salas:** diferencie participantes conectados de vagas ocupadas, que incluem reservas de reconexão. Preserve reserva temporária em quedas involuntárias, liberação imediata em saídas voluntárias e reconexão protegida por token. Códigos terminais de WebSocket não devem iniciar reconexão automática. Os valores padrão de capacidade e reserva estão no `README.md` e em `apps/signaling/src/room-state.ts`.
- **Contratos e segurança:** mantenha protocolo, web e signaling compatíveis, com validação de mensagens e identidades, restrições de origem e limites de requisições. Não exponha segredos, tokens de reconexão ou credenciais TURN reais em código, testes, logs, respostas do agente ou commits. Preserve a entrega de `reconnectToken` ao cliente autorizado na mensagem `peers` e de credenciais TURN temporárias pelo endpoint `/turn-credentials`.

## Onde investigar

Consulte apenas o material pertinente à tarefa. Se documentação e implementação divergirem, investigue antes de usar a afirmação como requisito.

| Assunto | Referências |
| --- | --- |
| Execução, comandos e configuração | `README.md`, `package.json` e manifests dos pacotes |
| Sessão e captura | `apps/web/src/features/room/hooks/useRoomSession.ts`, `apps/web/src/features/room/media/display-media.ts` |
| Negociação, ICE e recepção de tracks | `apps/web/src/features/room/webrtc/peer-manager.ts`, `DEBUG.md` |
| Sinalização, presença e reconexão | `apps/web/src/features/room/signaling/signaling-client.ts`, `apps/signaling/src/room-state.ts`, `apps/signaling/src/server.ts`, `packages/protocol/src/messages.ts` |
| Qualidade e adaptação de rede | `packages/protocol/src/quality.ts`, `apps/web/src/features/room/stats/stats-collector.ts`, `useRoomSession.ts` citado acima, `PERFORMANCE.md` |
| Conectividade e operação | `TURN.md`, `DEPLOY.md` |

## Validação e entrega

- Escolha verificações conforme o impacto. `pnpm test` executa testes unitários e de integração; `pnpm typecheck` verifica tipos; `pnpm build` compila o workspace. Mudanças apenas documentais não exigem a suíte da aplicação.
- Testes da web importam os builds de protocol e signaling. Para prepará-los em uma cópia limpa ou após alterações nesses pacotes, use `pnpm --filter @screen-room/signaling... build`.
- Para mudanças no ciclo de compartilhamento, valide os cenários afetados de início/parada/reinício, entrada tardia, múltiplos apresentadores, reconexão, limpeza e mensagens fora de ordem. Os E2E estão em `apps/web/e2e/sharing.spec.ts`: `pnpm --filter @screen-room/web test:e2e`, com navegador Playwright instalado. A configuração inicia signaling local compilado e web via Vite; a captura é sintética.
- Captura sintética e mocks não comprovam permissões nativas, captura de áudio real, autoplay ou conectividade STUN/TURN em redes distintas. Declare quais desses cenários foram efetivamente testados.
- Corrija falhas causadas pela tarefa; reporte falhas preexistentes ou limitações de ambiente. Na entrega, informe mudanças e arquivos afetados, comandos executados e resultados, verificações não realizadas e riscos ou decisões pendentes.
