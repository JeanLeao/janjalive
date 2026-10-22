# Performance da transmissão

## Prioridade, perfil e limite de FPS

As definições são centralizadas em `packages/protocol/src/quality.ts`. O padrão é **Nitidez · Equilibrado · 30 FPS**. A gaveta apresenta prioridade visual, nível de qualidade e somente os limites de FPS válidos.

| Prioridade | Perfil | Resolução máxima | FPS selecionáveis | Bitrate máximo por conexão |
|---|---|---:|---|---:|
| Nitidez | Econômico | 1280×720 | 20 / 30 | 1,6 Mbps |
| Nitidez | Equilibrado | 1920×1080 | 20 / 30 | 3 Mbps |
| Nitidez | Ultra | 2560×1440 | 20 / 30 | 6 Mbps |
| Fluidez | Econômico | 1280×720 | 30 | 2 Mbps |
| Fluidez | Equilibrado | 1280×720 | 30 / 60 | 4 Mbps |
| Fluidez | Ultra | 1920×1080 | 30 / 60 | 8 Mbps |

Esses valores são **tetos configurados**, não garantias de resolução, FPS ou bitrate entregue. Fontes menores não são ampliadas artificialmente. Ultra não significa 4K. Texto estático pode gerar poucos quadros e baixo bitrate mesmo com limites elevados.

Nitidez prioriza textos, código e documentos com `contentHint = 'text'` e `degradationPreference = 'maintain-resolution'`. Fluidez prioriza movimento com `contentHint = 'motion'` e `maintain-framerate`. São indicações ao navegador, que pode ignorá-las ou não implementá-las.

## Captura e envio

- `getDisplayMedia()` continua chamado na interação do usuário, antes de qualquer espera. Solicita apenas tela/aba e áudio da fonte, sem câmera ou microfone. Não há recaptura automática ao alterar qualidade.
- A seleção inicial solicita um envelope nativo de 60 FPS (`ideal` e `max`). Antes da prévia, `track.applyConstraints()` aplica o teto escolhido. Mesmo um `ideal: 20` inicial pode fixar a capacidade em 20 no Chromium; o envelope evita que Chromium fixe a capacidade nativa em 20 FPS e impeça aumentos posteriores sem recaptura. Resolução usa `ideal` e `max` desde a seleção. Ao atualizar uma track, os tetos respeitam as capacidades reportadas da fonte. Restrições impossíveis podem ser rejeitadas: a captura existente continua, a falha de verificação aparece no diagnóstico e o feedback não confirma aplicação integral.
- Atualizações de constraints são serializadas por track. Atualizações dos senders usam a barreira do peer que também protege substituição de tracks e negociação. A configuração mais recente permanece como referência para publicação, retomada, troca de origem, novos espectadores e conexões recriadas.
- Cada encoding de vídeo recebe `maxBitrate` e `maxFramerate` via `setParameters()`. A preferência de degradação é tentada e, em caso de rejeição, os limites são tentados novamente sem ela. Os parâmetros retornados são conferidos; aceitação não garante desempenho real.
- Áudio e estado de mudo não são alterados por qualidade. Pausa e troca de origem mantêm desanexação, gerações e limpeza existentes.

Ao mudar prioridade ou perfil, mantém-se o FPS válido. Se inválido, escolhe-se o maior permitido que não exceda o anterior; quando isso não existe, usa-se o menor permitido. Assim, Nitidez 20 → Fluidez 30, Fluidez 60 → Nitidez 30, e Fluidez 60 → Econômico 30.

O suporte a captura, constraints, `contentHint`, preferências de degradação e campos de estatísticas varia entre navegadores. Sem `getDisplayMedia()` não é possível apresentar; sem suporte a um ajuste a mídia continua com as limitações do navegador. Nenhum fallback solicita uma nova fonte.

Referências técnicas: [Screen Capture](https://w3c.github.io/mediacapture-screen-share/), [MediaStreamTrack content hints](https://www.w3.org/TR/mst-content-hint/), [WebRTC sender parameters](https://www.w3.org/TR/webrtc/#dom-rtcrtpsender-setparameters).

## Proteção automática de rede

A cada 3 segundos, as estatísticas são consultadas por peer. O gatilho considera a **pior perda de envio** entre espectadores, sem diluição pela média de conexões diferentes. Usa apenas deltas de relatórios `remote-inbound-rtp` ligados por `localId` ao vídeo enviado. O primeiro relatório cria a referência; relatórios repetidos, contadores reiniciados ou substituição de conexão não disparam redução. Receber vídeo com perdas de outro apresentador não reduz a própria qualidade.

Uma perda de envio de **5% ou mais**, com cooldown de **20 segundos**, reduz um nível: **Ultra → Equilibrado → Econômico**. Preserva prioridade e limita FPS conforme a matriz (Fluidez Ultra 60 → Equilibrado 60 → Econômico 30). A seleção manual permanece preservada: a gaveta distingue preferência, perfil temporariamente solicitado e resultado da verificação. Sem relatório remoto válido, não se infere perda de envio.

A recuperação é global, um nível por etapa (**Econômico → Equilibrado → Ultra**), limitada à preferência explícita. Reconstrói o FPS a partir dessa preferência: Fluidez Ultra 60 → Econômico 30 → Equilibrado 60 → Ultra 60; Nitidez 20 permanece em 20. Encerrar a captura descarta a redução temporária; a próxima captura parte da preferência manual.

Política conservadora da F34:

- Exige **60 segundos contínuos** de perda de envio **inferior a 2% em todos os peers**, e no mínimo **60 segundos desde a última decisão automática de redução ou recuperação**. Após cada tentativa começa uma nova janela. Reduções mantêm cooldown independente de 20 segundos.
- Cada intervalo deve ter ao menos **100 pacotes**, delta positivo de recebidos/enviados, perdas e contadores não negativos e monotônicos, mesma conexão e mesmos IDs de relatório. O primeiro relatório serve apenas de referência. Ausência de campo não vira zero.
- O relatório remoto deve avançar e os intervalos entre relatórios e coletas devem ser de no máximo **6 segundos** (duas cadências). Os timestamps remoto e de saída precisam estar disponíveis e a até 6 segundos um do outro. Uma coleta que demora mais de 6 segundos também bloqueia a recuperação. Relatórios repetidos, antigos, inválidos, tráfego insuficiente e falhas de coleta interrompem a janela.
- RTT remoto válido ou RTT atual do par selecionado, com timestamp recente comparado ao relatório de saída, **acima de 300 ms** bloqueia. Ausência de RTT isoladamente não bloqueia. Não se usa média de RTT acumulada.
- Todos os participantes remotos esperados precisam ter conexão e estatísticas válidas; ausência de espectadores não autoriza recuperação. Entrada, saída, substituição e mudança de estado de conexão descartam a estabilidade anterior, inclusive mudanças sinalizadas entre coletas.
- Somente captura local publicada, ativa e não pausada pode ser adaptada. Prévia, pausa, troca de fonte, escolha manual, encerramento e desmontagem invalidam observações pendentes. Aplicações usam as filas existentes de constraints e de `PeerManager.applyQuality()`; uma conclusão obsoleta não atualiza a preferência nem confirma sucesso. Uma redução pode substituir uma recuperação ainda pendente.

`quality-stability-start`, `quality-stability-reset`, `quality-downgrade`, `quality-recovery-attempt`, `quality-adaptation-result` e `quality-adaptation-obsolete` registram decisões e resultados sem notificações repetitivas. Falha ou aplicação parcial mantém a transmissão e aparece como aplicação incompleta/não verificada. Verificação confirma limites da captura e parâmetros retornados pelos senders, sem afirmar melhoria efetiva de resolução, FPS ou bitrate transmitido.

Os testes determinísticos injetam relógio monotônico e relatórios por peer. Os E2E F34 usam WebRTC local e captura sintética, com estatísticas de adaptação e relógio controlados, incluindo os estados normal, reduzido e recuperado em desktop/mobile. Não simulam congestionamento real de rede.

## Diagnóstico e medições

Os eventos técnicos distinguem seleção solicitada, captura verificada e parâmetros aceitos pelos senders. `getSettings()` informa resolução e frequência configuradas na track, que não comprovam a frequência codificada. `video-quality-stats` registra por peer FPS de codificação e recepção quando presentes em `framesPerSecond`, dimensões efetivas de envio/recepção, bytes e motivo de limitação do encoder quando disponível. Campos ausentes permanecem ausentes; nunca se copia FPS solicitado para métricas efetivas.

A gaveta de rede mostra médias apenas das medições válidas de bitrate, perda e RTT; ausência de medição não contribui como zero. O bitrate exige dois contadores compatíveis. A primeira perda válida usa contadores acumulados; as seguintes usam deltas com tráfego, sem produzir 0% em intervalos sem pacotes ou sem contador de perdas. A contagem considera `connectionState=connected`, independentemente da disponibilidade de RTP. Os detalhes por peer distinguem ausência de amostra, campo não fornecido, estatística indisponível e medição ainda não estabelecida. Em peers bidirecionais esse resumo prioriza recepção; ele não é o gatilho de proteção do envio. Eventos técnicos por peer permitem separar as direções.

Captura sintética e WebRTC local não comprovam áudio nativo, permissões interativas do sistema, conectividade entre redes ou qualidade sob congestionamento real.

## Custo em WebRTC mesh P2P

Cada apresentador envia uma cópia por espectador. Upload aproximado de vídeo é o bitrate efetivo por conexão multiplicado pelo número de espectadores, além de áudio e overhead. Em Ultra, os limites somados chegam a 54 Mbps (Nitidez) ou 72 Mbps (Fluidez) com nove espectadores. Codificação e processamento podem variar por conexão e implementação; não se presume um único encoder compartilhado. 60 FPS aumenta o custo de captura e codificação.

Múltiplos apresentadores controlam independentemente suas transmissões. Com N participantes e M apresentadores, existem até M × (N − 1) fluxos. Espectadores podem receber vários vídeos simultaneamente, elevando download e decodificação mesmo que apenas um esteja no palco.

O limite padrão permanece 10 participantes, incluindo reservas temporárias de reconexão de 30 segundos para quedas involuntárias. Saídas voluntárias liberam a vaga imediatamente. Não há garantia de desempenho para dez apresentadores simultâneos; este slice não introduz SFU, simulcast ou negociação avançada de codecs.
