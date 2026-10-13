# Diagnóstico e Depuração da Conexão WebRTC

Este documento descreve os procedimentos de inspeção de conexão, métricas de rede e ciclo de vida de eventos WebRTC no Screen Room.

---

## 1. Diagnóstico na Interface da Sala

Durante os testes ou transmissões, os dados de diagnóstico ficam disponíveis na gaveta de **Configurações** da sala (`/room/:roomId`):

1. Clique no botão de engrenagem no **Floating Control Dock** (dock flutuante inferior) ou no cabeçalho superior (**RoomHeader**).
2. Selecione a aba **Rede & Métricas**.

Nessa aba, você encontrará:

### Métricas de Conexão em Tempo Real
Quatro indicadores atualizados periodicamente (a cada 3 segundos via `RTCPeerConnection.getStats()`):
- **Latência (RTT):** Tempo de ida e volta dos pacotes em milissegundos (`rttMs`).
- **Perda de pacotes:** Percentual de pacotes descartados (`lossPercent`). Exibido em verde quando normal e em vermelho quando acima de 5%.
- **Taxa de bits:** Largura de banda de saída consumida em kbps (`bitrateKbps`).
- **Conexões ativas:** Quantidade de peers WebRTC com conexões estabelecidas.

### Eventos Técnicos
Um painel expansível contendo os últimos 50 eventos registrados pelo `DiagnosticsLogger`:
- Formato de cada linha: `HH:MM:SS [nome-do-evento] { detalhes }`.
- Botão **Copiar**: copia todo o histórico formatado diretamente para a área de transferência para facilitar o compartilhamento em análises técnicas.

---

## 2. Eventos Emitidos pelo Cliente (`apps/web`)

Abaixo estão os eventos técnicos realmente emitidos pelos módulos do cliente WebRTC:

### Ciclo de Sessão e Sinalização
- `session-init`: Inicialização da sessão com ID do participante (`peerId`) e nickname inicial.
- `signal-connecting`: Tentativa de conexão WebSocket com a URL do servidor de sinalização.
- `signal-open`: Conexão WebSocket estabelecida com sucesso.
- `signal-send`: Mensagem enviada pelo cliente ao servidor (`join`, `signal`, `update-nickname`).
- `signal-receive`: Mensagem recebida do servidor (`peers`, `peer-joined`, `peer-left`, `peer-updated`, `signal`, `error`).
- `signal-close`: Conexão WebSocket fechada (com código e indicação de fechamento limpo).
- `signal-error`: Erro no canal WebSocket.
- `signal-skip`: Mensagem ignorada por socket ainda não aberto.
- `signal-malformed` / `signal-parse-error`: Mensagens de sinalização inválidas ou com erro de decodificação JSON.
- `nickname-updated`: Notificação local de alteração de nickname do participante.

### Configuração ICE e TURN
- `turn-config`: Configuração ICE obtida com sucesso via `/turn-credentials` (informa quantidade de servidores e presença de relays).
- `turn-config-fallback`: Falha ao buscar credenciais TURN no endpoint; cliente recorre aos servidores STUN de contingência.

### Captura de Mídia e Áudio
- `screen-capture-request`: Início da solicitação de tela ao navegador com o perfil selecionado.
- `screen-captured`: Compartilhamento concedido pelo usuário (informa quantidade de trilhas de vídeo e áudio).
- `screen-capture-error`: Recusa de permissão ou falha de captura da API `getDisplayMedia`.
- `screen-stopped`: Compartilhamento de tela interrompido.
- `screen-audio`: Trilha de áudio da tela mutada ou reativada (`muted: true/false`).

### Conexões P2P e Negociação WebRTC
- `pc-created`: Instância de `RTCPeerConnection` inicializada para um peer específico.
- `pc-unavailable`: Ambiente do navegador sem suporte nativo a `RTCPeerConnection`.
- `offer-created`: Oferta SDP gerada pelo apresentador para um espectador.
- `offer-received`: Oferta SDP recebida pelo espectador.
- `offer-skip` / `offer-abort`: Criação de oferta ignorada por estado incompatível ou ausência de mídia.
- `answer-created`: Resposta SDP criada pelo espectador em réplica a uma oferta.
- `answer-received`: Resposta SDP recebida e aplicada pelo apresentador.
- `ice-local`: Candidato ICE local gerado pelo navegador.
- `ice-remote`: Candidato ICE recebido do peer remoto e aplicado.
- `ice-queued`: Candidato ICE colocado em fila enquanto o `remoteDescription` não está pronto.
- `ice-flushed`: Candidatos ICE pendentes descarregados após o estabelecimento da descrição remota.
- `pc-signaling`: Mudança no estado de sinalização (`pc.signalingState`).
- `pc-ice`: Mudança no estado da conexão ICE (`new`, `checking`, `connected`, `completed`, `failed`, `disconnected`, `closed`).
- `pc-connection`: Mudança no estado geral da conexão (`new`, `connecting`, `connected`, `disconnected`, `failed`, `closed`).
- `remote-track`: Trilha remota de mídia recebida e vinculada.
- `pc-closed`: Conexão com o peer encerrada e recursos liberados.

### Métricas e Adaptação Automática
- `network-stats`: Amostra periódica de métricas de rede (bitrate, perda e latência RTT).
- `quality-downgrade`: Redução automática do perfil de qualidade acionada por perda de pacotes superior a 5%.
- `quality-applied`: Aplicação de parâmetros de qualidade aos emissores RTP (`RTCRtpSender`).
- `quality-apply-skip`: Aviso caso o navegador não permita alterar parâmetros no sender de vídeo.

---

## 3. Logs do Servidor de Sinalização (`apps/signaling`)

No servidor, os logs utilizam o prefixo `[screen-room:signal]` seguido por objetos JSON estruturados:

Para acompanhar localmente em desenvolvimento:

```bash
pnpm dev:signaling
```

Eventos emitidos pelo servidor:
- `join`: Participante entrou em uma sala (`roomId`, `peerId`, `nickname`, `count`).
- `leave`: Participante desconectou-se da sala (`roomId`, `peerId`, `count`).
- `relay`: Encaminhamento de sinalização entre peers (`roomId`, `from`, `to`, `type`, `delivered`).
- `update-nickname`: Alteração de nickname de participante propagada para a sala.
- `rejected-ws-origin`: Conexão WebSocket rejeitada por violação da política de origens (`ALLOWED_ORIGINS`).
- `rejected-http-origin`: Requisição HTTP a `/turn-credentials` rejeitada por origem não autorizada.

---

## 4. Fluxo Esperado de Negociação Entre Dois Clientes

Ao testar a aplicação com dois navegadores (Cliente A = Apresentador, Cliente B = Espectador):

1. **Entrada na Sala:**
   - Ambos conectam via WebSocket: `signal-connecting` -> `signal-open`.
   - Cliente A envia `join` e recebe `signal-receive (type=peers, count=1)`.
   - Cliente B entra na mesma sala e recebe `signal-receive (type=peers, count=2)`.
   - Cliente A recebe `signal-receive (type=peer-joined, count=2)`.
2. **Início do Compartilhamento (Cliente A):**
   - Cliente A inicia o compartilhamento: `screen-capture-request` -> `screen-captured`.
   - Cliente A gera a oferta: `pc-created` -> `offer-created` -> `signal-send (type=offer)`.
3. **Recepção e Resposta (Cliente B):**
   - Cliente B recebe a oferta: `signal-receive (type=signal)` -> `offer-received`.
   - Cliente B gera a resposta: `answer-created` -> `signal-send (type=answer)`.
   - Cliente A recebe a resposta: `signal-receive (type=signal)` -> `answer-received`.
4. **Troca de Candidatos ICE:**
   - Ambos emitem `ice-local` e encaminham candidatos via sinalização.
   - Ambos recebem e aplicam `ice-remote`.
   - Estado de ICE evolui de `pc-ice state=checking` para `pc-ice state=connected`.
   - Estado de conexão WebRTC evolui para `pc-connection state=connected`.
5. **Apresentação:**
   - Cliente B recebe a trilha remota (`remote-track`) e o vídeo surge em destaque no `RoomStage`.

---

## 5. Diagnóstico de Falhas Comuns

- **`signal-error` ou desconexão imediata:**
  Verifique se o servidor de sinalização está acessível e se a origem pública da página está contemplada em `ALLOWED_ORIGINS`.
- **`offer-created` não é emitido:**
  O compartilhamento de tela não foi concedido pelo usuário ou não havia outro participante registrado na sala no momento.
- **`offer-created` aparece no apresentador mas `offer-received` não chega no espectador:**
  Problema na sinalização intermediária (verifique os logs de `relay` no servidor).
- **Conexão estagnada em `pc-ice state=checking` ou transitando para `failed`:**
  A conexão direta P2P foi bloqueada por NAT simétrico ou firewall restritivo. Nesse caso, a travessia depende do servidor TURN. Verifique se o evento `turn-config` reportou `relay: true` e se as portas UDP/TCP do coturn estão liberadas.
