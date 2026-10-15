# Performance da transmissão

## Prioridade, perfil e limite de FPS

As definições são centralizadas em `packages/protocol/src/quality.ts`. O padrão é **Nitidez · Equilibrado · 20 FPS**. A gaveta apresenta prioridade visual, nível de qualidade e somente os limites de FPS válidos.

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

Uma perda de envio de **5% ou mais**, com cooldown de **20 segundos**, reduz um nível: **Ultra → Equilibrado → Econômico**. Preserva prioridade e limita FPS conforme a matriz (Fluidez Ultra 60 → Equilibrado 60 → Econômico 30). O apresentador recebe uma notificação e a seleção reflete o novo nível solicitado. Sem relatório remoto válido, não se infere perda de envio. Não há recuperação automática de qualidade.

## Diagnóstico e medições

Os eventos técnicos distinguem seleção solicitada, captura verificada e parâmetros aceitos pelos senders. `getSettings()` informa resolução e frequência configuradas na track, que não comprovam a frequência codificada. `video-quality-stats` registra por peer FPS de codificação e recepção quando presentes em `framesPerSecond`, dimensões efetivas de envio/recepção, bytes e motivo de limitação do encoder quando disponível. Campos ausentes permanecem ausentes; nunca se copia FPS solicitado para métricas efetivas.

A gaveta de rede mantém bitrate e perda medidos no intervalo (média das conexões para apresentação), RTT e contagem de conexões. Em peers bidirecionais esse resumo prioriza recepção; ele não é o gatilho de proteção do envio. Eventos técnicos por peer permitem separar as direções.

Resultados e limitações da validação F01/F02 estão em [docs/validation/f01-f02.md](docs/validation/f01-f02.md). Captura sintética e WebRTC local não comprovam áudio nativo, permissões interativas do sistema, conectividade entre redes ou qualidade sob congestionamento real.

## Custo em WebRTC mesh P2P

Cada apresentador envia uma cópia por espectador. Upload aproximado de vídeo é o bitrate efetivo por conexão multiplicado pelo número de espectadores, além de áudio e overhead. Em Ultra, os limites somados chegam a 54 Mbps (Nitidez) ou 72 Mbps (Fluidez) com nove espectadores. Codificação e processamento podem variar por conexão e implementação; não se presume um único encoder compartilhado. 60 FPS aumenta o custo de captura e codificação.

Múltiplos apresentadores controlam independentemente suas transmissões. Com N participantes e M apresentadores, existem até M × (N − 1) fluxos. Espectadores podem receber vários vídeos simultaneamente, elevando download e decodificação mesmo que apenas um esteja no palco.

O limite padrão permanece 10 participantes, incluindo reservas temporárias de reconexão de 30 segundos para quedas involuntárias. Saídas voluntárias liberam a vaga imediatamente. Não há garantia de desempenho para dez apresentadores simultâneos; este slice não introduz SFU, simulcast ou negociação avançada de codecs.
