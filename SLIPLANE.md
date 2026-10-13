# Configuração e Deploy no Sliplane

Este documento descreve o procedimento de deploy do Screen Room na plataforma Sliplane, utilizando a arquitetura desacoplada de dois serviços sob a mesma origem pública.

---

## 1. Visão Geral da Arquitetura

O Screen Room é composto por dois serviços independentes:

1. **`apps/signaling`**: Servidor Node.js para WebSocket de sinalização (`/signal`), emissão de credenciais temporárias TURN (`/turn-credentials`) e verificação de saúde (`/healthz`).
2. **`apps/web`**: Aplicação de interface web e SSR em TanStack Start (construída pelo Nitro) com React 19.

Para funcionamento correto das chamadas relativas do frontend, ambos os serviços devem ser expostos sob o **mesmo domínio/origem pública** através de regras de roteamento / reverse proxy:
- `/signal` (WebSocket) -> `screen-room-signaling` (porta 3000)
- `/turn-credentials` (HTTP GET) -> `screen-room-signaling` (porta 3000)
- `/healthz` (HTTP GET) -> `screen-room-signaling` (porta 3000)
- `/*` (HTTP/SSR e arquivos estáticos) -> `screen-room-web` (porta 3001)

---

## 2. Deploy do Serviço de Sinalização (`apps/signaling`)

1. No painel do Sliplane, crie um novo **App Runtime** (ex.: `screen-room-signaling`).
2. Conecte o repositório Git do projeto.
3. Configure o deploy baseado em Dockerfile:
   - **Dockerfile path:** `apps/signaling/Dockerfile`
   - **Build Context:** `.` (raiz do monorepo)
4. Defina a porta interna: `3000` (ou utilize a variável de ambiente `PORT` provida pelo Sliplane).
5. Certifique-se de que o suporte a **WebSocket** está ativo para o serviço.
6. **Variáveis de Ambiente:**
   - `PORT`: `3000`
   - `HOST`: `0.0.0.0`
   - `ALLOWED_ORIGINS`: Domínio público da aplicação (ex.: `https://screen.example.com`). Obrigatório em produção para autorizar o WebSocket e o endpoint de credenciais TURN.
   - `TURN_SECRET`: Chave secreta compartilhada para o coturn (opcional, para habilitar relay TURN).
   - `TURN_HOST`: Endereço IP público ou hostname do servidor coturn (opcional).
7. **Health Check:**
   - **Caminho:** `/healthz` ou `/health`
   - **Porta:** `3000`
   - **Esperado:** HTTP 200 com JSON `{ "status": "ok", "service": "signaling" }`

---

## 3. Deploy do Serviço Web (`apps/web`)

1. No painel do Sliplane, crie um segundo **App Runtime** (ex.: `screen-room-web`).
2. Conecte o repositório Git do projeto.
3. Configure o deploy baseado em Dockerfile:
   - **Dockerfile path:** `apps/web/Dockerfile`
   - **Build Context:** `.` (raiz do monorepo)
4. Defina a porta interna: `3001` (ou utilize a variável de ambiente `PORT` provida pelo Sliplane). O container executa o runtime Node oficial gerado pelo Nitro (`node .output/server/index.mjs`).
5. **Variáveis de Ambiente:**
   - `PORT`: `3001`
   - `HOST`: `0.0.0.0`
   - `NODE_ENV`: `production`

---

## 4. Roteamento e Unificação Sob a Mesma Origem

Para que o navegador acerte o signaling e o TURN de forma transparente via URLs relativas sem erros de CORS ou certificados:

Configure o roteador de tráfego do Sliplane (ou proxy de borda Caddy, Cloudflare ou Nginx) com as seguintes rotas no mesmo domínio:

| Caminho da Requisição | Tipo de Tráfego | Serviço de Destino | Porta Interna |
|---|---|---|---|
| `/signal*` | WebSocket | `screen-room-signaling` | `3000` |
| `/turn-credentials*` | HTTP GET | `screen-room-signaling` | `3000` |
| `/healthz` | HTTP GET | `screen-room-signaling` | `3000` |
| `/*` (todas as demais) | HTTP / SSR | `screen-room-web` | `3001` |

> [!TIP]
> Ao configurar o encaminhamento do WebSocket (`/signal`), assegure-se de que os cabeçalhos `Upgrade: websocket` e `Connection: Upgrade` sejam repassados e que o timeout de leitura seja estendido para conexões duradouras.
