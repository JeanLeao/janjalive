# Conectividade WebRTC com TURN

Este documento descreve a integração com servidores TURN no Screen Room, a emissão de credenciais temporárias no serviço de sinalização, os requisitos de firewall e o comportamento de contingência (fallback).

---

## 1. Papel do TURN na Aplicação

O WebRTC prioriza conexões diretas P2P (ponto a ponto) entre navegadores através de servidores STUN. No entanto, em cenários com:
- NAT simétrico (comum em redes corporativas e redes móveis celulares);
- Roteadores com filtragem estrita de portas;
- Firewalls corporativos que bloqueiam tráfego UDP direto não originado pelo cliente;

A conexão direta pode falhar na fase de checagem ICE (`pc-ice state=checking` -> `failed`). Nesses cenários, um servidor TURN atua como relay (retransmissor intermediário) de mídia para garantir que a transmissão ocorra normalmente.

---

## 2. Emissão de Credenciais no Signaling (`apps/signaling/src/turn.ts`)

O serviço de sinalização expõe o endpoint `GET /turn-credentials`, que gera credenciais temporárias assinadas via HMAC-SHA1 compatíveis com a especificação de credenciais efêmeras do coturn (`use-auth-secret`):

### Variáveis de Ambiente do Serviço de Sinalização

| Variável | Descrição | Valor Padrão de Fallback no Código |
|---|---|---|
| `TURN_SECRET_FILE` | Caminho no sistema de arquivos para o arquivo contendo a chave secreta compartilhada do coturn | `/etc/screen-room/turn-secret` |
| `TURN_SECRET` | Chave secreta em string (utilizada caso o arquivo especificado não exista) | `""` (vazio) |
| `TURN_HOST` | Endereço IP público ou hostname do servidor coturn | Obrigatório quando TURN estiver configurado (sem fallback hardcoded) |

> [!IMPORTANT]
> - O segredo TURN é validado e carregado em cache na inicialização do serviço (PERF-01). A substituição ou rotação do segredo exige reinicialização do serviço de sinalização.
> - Se houver segredo TURN configurado (`TURN_SECRET` ou `TURN_SECRET_FILE`) sem a definição de `TURN_HOST`, o servidor de sinalização falhará explicitamente na inicialização (CFG-01), evitando o anúncio silencioso de relays inexistentes.
> - Nenhum endereço IP público é fixado no código-fonte. Quando nenhum segredo for fornecido, o serviço opera em modo STUN-only com servidores públicos.

### Algoritmo de Geração de Credenciais

Quando uma chave secreta válida é configurada:
1. Um nome de usuário temporário é gerado no formato: `<timestamp_expiracao>:<uuid>`, onde `timestamp_expiracao` é o momento atual acrescido de **3600 segundos (1 hora)**.
2. A credencial é calculada como:
   $$\text{credential} = \text{Base64}(\text{HMAC-SHA1}(\text{secret}, \text{username}))$$
3. A resposta JSON contém:
   ```json
   {
     "iceServers": [
       { "urls": "stun:stun.l.google.com:19302" },
       {
         "urls": [
           "turn:<TURN_HOST>:3478?transport=udp",
           "turn:<TURN_HOST>:3478?transport=tcp"
         ],
         "username": "1728860000:uuid-v4",
         "credential": "base64-hmac-sha1"
       }
     ]
   }
   ```

---

## 3. Comportamento de Contingência (Fallback)

A aplicação foi projetada para operar em modo resiliente sem interromper o usuário:

1. **Servidor sem Segredo Configurado:**
   Se `TURN_SECRET` e `TURN_SECRET_FILE` não estiverem definidos no servidor de sinalização, o endpoint `/turn-credentials` retorna apenas o servidor STUN público do Google:
   ```json
   { "iceServers": [{ "urls": "stun:stun.l.google.com:19302" }] }
   ```
2. **Falha na Requisição ou Resposta Inválida no Cliente:**
   No cliente web (`apps/web/src/features/room/webrtc/ice-config.ts`), se a requisição HTTP a `/turn-credentials` falhar (erro de rede, proxy ou formato inesperado), o cliente registra o evento `turn-config-fallback` e utiliza automaticamente os servidores STUN de contingência definidos em `DEFAULT_ICE_SERVERS`:
   - `stun:stun.l.google.com:19302`
   - `stun:global.stun.twilio.com:3478`

---

## 4. Requisitos de Portas e Conectividade para o Coturn

Para viabilizar a travessia de mídia por meio de uma instância do `coturn`:

| Protocolo | Porta / Faixa | Finalidade |
|---|---|---|
| **UDP** | `3478` | Tráfego preferencial STUN e TURN sobre UDP |
| **TCP** | `3478` | TURN sobre TCP para redes restritivas onde pacotes UDP de saída são bloqueados |
| **UDP** | `49160–49200` | Faixa de portas de relay de mídia (deve coincidir com `min-port` e `max-port` no `turnserver.conf`) |

> [!IMPORTANT]
> - Túneis baseados em Cloudflare Tunnel ou proxies HTTP reversos transportam apenas tráfego HTTP e WebSocket. O tráfego de mídia UDP das portas 3478 e 49160–49200 **não passa por proxies HTTP** e deve ser roteado diretamente para o servidor TURN com regras de entrada/saída liberadas no firewall do provedor de nuvem (Security Groups, iptables ou firewall do provedor).
> - As portas e faixas acima referem-se à especificação de configuração do serviço coturn. A confirmação de conectividade em cada ambiente deve ser validada por testes de rede diretos.

---

## 5. Inspeção no Navegador

Para confirmar se as credenciais TURN foram recebidas e se a negociação utilizou o servidor:

1. Na sala (`/room/:roomId`), abra **Configurações** -> **Rede & Métricas** -> **Eventos técnicos**.
2. Verifique o evento de inicialização de configuração:
   ```text
   turn-config servers=2 relay=true
   ```
   *(Caso ocorra fallback para apenas STUN, o log registrará `turn-config servers=1 relay=false` ou `turn-config-fallback`).*
3. Após o início do compartilhamento, a conexão deve transitar por:
   ```text
   pc-ice state=checking
   pc-ice state=connected
   pc-connection state=connected
   ```
4. Se a conexão direta P2P entre os navegadores for viável, o navegador utilizará candidatos locais (`host` ou `srflx`). Caso contrário, o ICE automaticamente selecionará os candidatos do tipo `relay` fornecidos pelo servidor TURN.
