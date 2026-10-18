Relatório da implementação F24 na branch `feat/f24-individual-audio`, a partir de `main`. Validações realizadas localmente antes da publicação para revisão. Arquivos locais preexistentes preservados.

Arquivos de implementação:

- `apps/web/src/features/room/components/RoomStage.tsx`: preferências por participante, escolha exclusiva da fonte audível, integração com Comparar/F29, popover na barra existente, identificação de pausa/ausência de faixa/mudo/bloqueio e volume do dispositivo no iOS.
- `apps/web/src/features/room/hooks/useMediaStreamVideo.ts`: separação entre associação do stream e ajustes de reprodução; silenciamento da fonte anterior antes de habilitar outra; proteção contra resultados obsoletos de `play()`.
- `apps/web/e2e/sharing.spec.ts`: regressões F24 de preferências, identidade do vídeo/stream, sobreposição de áudio, pausa, F27 com/sem áudio, F29 com três apresentadores incluindo reprodução local, desaparecimento da fonte, reconexão, autoplay, teclado e toque emulado.
- `apps/web/e2e/viewing-modes.spec.ts`: ajustes de áudio preservam vídeo, stream e PiP em Cinema/fullscreen.

Comportamento de recuperação: perder a fonte escolhida deixa silêncio; o espectador pode escolher uma fonte ou selecionar a principal explicitamente. Sair da comparação pelo controle retorna à principal com sua preferência de mudo. Alterações de áudio são locais, sem modificar tracks enviadas, captura, signaling, protocolo ou negociação.

Validação executada (logs versionados com cores ANSI e espaços ao fim das linhas removidos para leitura):

- `pnpm --filter @screen-room/signaling... build`: preparação aprovada.
- `pnpm typecheck`: passou; ver `typecheck.log`.
- `pnpm test`: 237 testes passaram (16 protocol, 90 signaling, 131 web); ver `tests.log`.
- `pnpm build`: passou, com avisos do bundler sobre diretivas de módulos de dependências; ver `build.log`.
- `pnpm --filter @screen-room/web test:e2e --grep 'F24|F22 both|F22 collapsible.*1440|F22 entering|WebKit presentation' --workers=1`: 9 passaram em 47,1 segundos, sem skips; ver `e2e-final.log`.
- Rodadas direcionadas anteriores também aprovaram os oito cenários existentes do F29, os três cenários F22 de composição e ciclo de vida em desktop/390/320 px, a geometria da barra em 1440/1024/768/600/390/320 px e os cenários existentes de Cinema e PiP. A suíte E2E completa do repositório não foi executada.
- O teste F24 monitora cada alteração de `muted` e confirmou zero sobreposição de elementos desmutados durante as transições testadas. Ajustes de volume/mudo mantiveram a identidade do elemento e de `srcObject`.
- Revisão pela skill local `.agent/skills/impeccable/SKILL.md`, com contexto da implementação existente e detector mecânico sem achados. Revisão visual de desktop/mobile, com controles de 36 px no desktop e 44 px em telas pequenas/toque; ações e slider do popover com área mínima de 44 px. Ver capturas abaixo.

Evidências:

- [Comparar em 1440 px, secundária audível e principal em mudo](f24-audio-1440.png).
- [Comparar em 320 px, popover dentro da viewport](f24-audio-320.png).
- [iOS simulado: mudo e orientação para volume do dispositivo](f24-ios-mute-320.png).
- [Cinema/fullscreen com PiP simulado e ajustes locais](f24-fullscreen-pip.png).
- [Mudo explícito após autoplay bloqueado](f24-muted-blocked.png).

Falhas intermediárias e correções:

- F27 pode manter uma track receptora viva mesmo após remover o áudio da captura. A disponibilidade agora combina a track recebida com o estado anunciado pelo apresentador.
- A ação de escolher a fonte desaparece depois da seleção. O foco agora passa ao botão de mudo, mantendo Escape e retorno de foco funcionais.
- O teste de reconexão foi corrigido para fechar somente sockets de `/signal`, preservando a conexão do Vite.
- Houve falhas intermediárias de recepção de quadros durante edições/build simultâneos aos E2E, com recargas e conexões encerradas nos traces. Os cenários afetados passaram na rodada isolada, sem build/edição simultâneos. Essas falhas não foram classificadas como preexistentes.

Limitações e riscos restantes:

- Chromium headless, captura por canvas e áudio sintético. Verificação de propriedades e exclusividade de reprodução não comprova áudio efetivamente ouvido em hardware.
- Bloqueio de autoplay foi induzido no fixture; políticas nativas, áudio real de aba/sistema e permissões reais ainda precisam de validação manual.
- iOS foi simulado por user agent e toque; o modo WebKit/PiP foi simulado em Chromium. Não foram executados Safari, Firefox, iPhone/iPad ou outros dispositivos físicos.
- Teclado, rótulos/roles acessíveis, foco e toque emulado foram testados; não houve leitura falada com VoiceOver/NVDA.
- STUN/TURN em redes distintas e PiP nativo não foram validados. Nenhuma alteração nesses subsistemas foi necessária.
- Não há decisão pendente que exija ampliação do escopo aprovado.

Confirmação final de evidências: `pnpm --filter @screen-room/web test:e2e --grep F24 --workers=1` passou novamente em cinco cenários, com animações desabilitadas nas capturas para registrar os estados estáveis; ver `e2e-evidence.log`.
