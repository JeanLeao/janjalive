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

## 5. Limites da Arquitetura P2P Mesh e Capacidade por Sala

O Screen Room adota como padrão o limite operacional de **10 participantes simultâneos por sala** (incluindo o apresentador), controlado diretamente no servidor de sinalização (`MAX_PARTICIPANTS_PER_ROOM`).

> [!NOTE]
> **Controle de Admissão e Reserva Efêmera (Política A):**
> - **Invariante:** $\text{participantes ativos} + \text{reservas de vaga válidas} \le \text{capacidade máxima (padrão 10)}$.
> - **Distinção de Contagem:** A presença transmitida aos usuários e utilizada no cálculo de conexões P2P (`count`) reflete estritamente os participantes conectados no momento. O controle de admissão do servidor (`occupiedSlots`) contabiliza tanto os participantes conectados quanto as reservas ativas de vaga.
> - **Queda involuntária:** Mantém a vaga e a identidade reservadas por 30 segundos, rejeitando novos visitantes com código terminal `4009` (`ROOM_FULL`) e garantindo que o participante original possa retornar sem risco de sala cheia.
> - **Saída voluntária:** Libera a vaga e destrói o token imediatamente, sem retenção de reserva.
> - **Expiração:** Ao término dos 30 segundos sem reconexão, a reserva expira e a vaga é liberada para terceiros.

A arquitetura de distribuição de vídeo baseia-se em **WebRTC Mesh direta (P2P)**, sem unidade seletiva de encaminhamento (SFU) no fluxo de mídia:

### 1. Modelo Principal de Transmissão (1 Apresentador + 9 Espectadores)
No cenário recomendado e prioritário (compartilhamento de tela com múltiplos espectadores):
- O apresentador codifica o vídeo da tela uma única vez e envia um fluxo P2P independente para cada espectador conectado.
- A largura de banda de upload exigida do apresentador cresce de forma diretamente proporcional ao número de espectadores conectados ($N - 1$):
  $$\text{Upload Total Exigido} \approx \text{Bitrate do Perfil} \times (\text{Espectadores})$$

Tabela de consumo de upload do apresentador na capacidade máxima (9 espectadores):

| Perfil de Vídeo | Bitrate por Conexão | Upload Total com 3 Espectadores | Upload Total com 5 Espectadores | Upload Total com 9 Espectadores (Capacidade Máxima) |
|---|---:|---:|---:|---:|
| **Econômico** (`economy`) | 800 kbps | ~2,4 Mbps | ~4,0 Mbps | **~7,2 Mbps** |
| **Equilibrado** (`balanced` — padrão) | 1,5 Mbps | ~4,5 Mbps | ~7,5 Mbps | **~13,5 Mbps** |
| **Alta Qualidade** (`high`) | 3,0 Mbps | ~9,0 Mbps | ~15,0 Mbps | **~27,0 Mbps** |

> [!TIP]
> **Consumo nos Espectadores:** Cada espectador recebe apenas o fluxo de download correspondente à transmissão ativa (ex.: 1,5 Mbps no perfil equilibrado). Portanto, o impacto de rede e CPU nos espectadores é leve e constante, independente do número de pessoas na sala.

### 2. Múltiplas Transmissões Simultâneas em Topologia Mesh
Se múltiplos participantes compartilharem a tela ao mesmo tempo em uma sala com $N$ participantes e $M$ apresentadores:
- O número total de transmissões ativas que trafegam na rede é:
  $$\text{Total de Fluxos na Malha} = M \times (N - 1)$$
- **Exemplo com 2 apresentadores simultâneos ($N = 10$, $M = 2$):**
  - Cada apresentador envia 9 fluxos de upload (~13,5 Mbps no perfil equilibrado).
  - Cada um dos 8 demais espectadores baixa 2 fluxos de vídeo (~3,0 Mbps).
  - Total de 18 fluxos de vídeo trafegando na malha.
- **Limitação de 10 transmissões simultâneas:** Se todos os 10 participantes tentassem compartilhar a tela simultaneamente em malha completa, seriam gerados $10 \times 9 = 90$ fluxos de vídeo concorrentes, exigindo ~13,5 Mbps de upload e ~13,5 Mbps de download por participante, além de decodificação de 9 vídeos simultâneos no navegador. Isso provocaria estrangulamento severo em conexões residenciais e processadores comuns.

> [!IMPORTANT]
> O Screen Room foi projetado primariamente como uma aplicação *streaming-first* (um apresentador principal, eventualmente alternado, transmitindo para até 9 espectadores). Não há garantia de qualidade para 10 transmissões de tela ocorrendo concomitantemente em malha mesh P2P sem infraestrutura de SFU.
> Para casos de uso pós-MVP que exijam mais de 10 participantes ou videoconferência muitos-para-muitos com vídeo constante de todos os membros, a evolução recomendada é a introdução de um SFU (Selective Forwarding Unit, como LiveKit, mediasoup ou Janus).
