# Performance da Transmissão

Este documento descreve os perfis de qualidade de vídeo do Screen Room, os mecanismos de limitação de taxa e a política conservadora de adaptação automática de rede.

---

## 1. Perfis de Qualidade

Os perfis de qualidade são definidos centralizadamente em `packages/protocol/src/quality.ts`:

| Perfil | Resolução Máxima | FPS Máximo | Bitrate Máximo | Cenário de Uso Recomendado |
|---|---:|---:|---:|---|
| **Econômico** (`economy`) | 1280×720 (720p) | 15 FPS | 800 kbps (800.000 bps) | Conexões móveis, conexões com oscilação ou relay via TURN |
| **Equilibrado** (`balanced` — padrão) | 1280×720 (720p) | 20 FPS | 1,5 Mbps (1.500.000 bps) | Apresentações de slides, navegação em sistemas e reuniões cotidianas |
| **Alta Qualidade** (`high`) | 1920×1080 (1080p) | 20 FPS | 3,0 Mbps (3.000.000 bps) | Linhas de código, tipografia miúda e diagramas detalhados em conexões de alta velocidade |

> [!NOTE]
> Não há perfil configurado para 60 FPS nem ajuste contínuo de resolução sem degrau. O Screen Room prioriza legibilidade de texto estático e estabilidade da transmissão sobre altas taxas de quadros típicas de jogos eletrônicos.

---

## 2. Aplicação Técnica dos Limites

Os limites definidos são aplicados em duas camadas:

1. **Captura no Navegador:**
   Ao chamar `navigator.mediaDevices.getDisplayMedia`, as restrições `ideal` e `max` de `frameRate`, `width` e `height` correspondentes ao perfil escolhido são passadas como restrições de mídia.
2. **Camada de Envio WebRTC:**
   Em conexões existentes ou ao trocar de qualidade durante a transmissão, a função `PeerManager.applyQuality` atualiza os emissores de vídeo (`RTCRtpSender`) via `sender.setParameters`:
   ```typescript
   parameters.encodings[0].maxBitrate = profile.maxBitrate;
   parameters.encodings[0].maxFramerate = profile.maxFramerate;
   await sender.setParameters(parameters);
   ```

---

## 3. Adaptação Automática Conservadora

O Screen Room adota uma estratégia conservadora de adaptação para evitar degradações bruscas e loops de oscilação de qualidade:

- **Coleta Periódica:**
  O módulo `StatsCollector` consulta as estatísticas WebRTC de todos os peers a cada **3 segundos** (`RTCPeerConnection.getStats()`).
- **Gatilho de Degradação:**
  Se a média de perda de pacotes relatada pelos espectadores for **igual ou superior a 5%** (`lossPercent >= 5`), o sistema aciona uma redução de qualidade em um degrau:
  - `high` -> `balanced`
  - `balanced` -> `economy`
- **Janela de Cooldown:**
  A redução automática só pode ocorrer no máximo **uma vez a cada 20 segundos**, impedindo rebaixamentos sucessivos em picos momentâneos de perda de pacote.
- **Feedback Visual:**
  Ao ocorrer o downgrade automático, uma notificação flutuante informa o apresentador:
  *"Rede instável: qualidade de transmissão reduzida automaticamente."*
- **Sem Aumento Automático:**
  O sistema **nunca aumenta a qualidade de volta automaticamente**. Redes instáveis frequentemente enganam detectores com períodos curtos de calmaria; elevar a taxa de bits provocaria novos descartes de pacotes e congelamento de vídeo. Qualquer elevação de qualidade deve ser decidida manualmente pelo usuário nas Configurações.

---

## 4. Controles na Interface

Durante a transmissão, os controles de performance e mídia estão disponíveis em:

- **Gaveta de Configurações (Aba Qualidade):** Seleção manual entre os 3 perfis disponíveis (`Alta qualidade`, `Equilibrada` e `Econômica`).
- **Gaveta de Configurações (Aba Áudio) e Floating Control Dock:** Botão de controle de mudo da tela. Ao mutar, apenas a trilha `audioTrack` da tela capturada é desabilitada (`track.enabled = false`), mantendo o vídeo fluindo normalmente. Não há captura de microfone.
- **Gaveta de Configurações (Aba Rede & Métricas):** Visualização em tempo real de latência (RTT), perda de pacotes, bitrate atual e contagem de conexões ativas.

---

## 5. Limites da Arquitetura P2P Mesh

O Screen Room utiliza uma arquitetura **WebRTC Mesh direta**:

- O apresentador codifica e envia um fluxo independente de vídeo e áudio para cada espectador conectado na sala.
- A largura de banda de upload exigida do apresentador cresce de forma diretamente proporcional ao número de espectadores:
  $$\text{Upload Total} \approx \text{Bitrate do Perfil} \times (\text{Espectadores})$$
- Exemplo no perfil Equilibrado (1,5 Mbps):
  - 1 espectador: ~1,5 Mbps de upload
  - 3 espectadores: ~4,5 Mbps de upload
  - 5 espectadores: ~7,5 Mbps de upload

Essa arquitetura é indicada para grupos pequenos (2 a 6 participantes). Para salas com dezenas de espectadores simultâneos, a evolução indicada para etapas pós-MVP é a introdução de uma unidade seletiva de encaminhamento (SFU, como LiveKit, mediasoup ou Janus).
