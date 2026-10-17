# Screen Room

Aplicação WebRTC streaming-first projetada especificamente para **compartilhamento de tela e áudio da aba/sistema em tempo real**.

O Screen Room foi construído com foco em simplicidade, privacidade e desempenho: não exige cadastro, não armazena dados em contas de usuário e opera em salas efêmeras acessadas diretamente por link ou código.

---

## Características Principais

- **Streaming-first:** O foco central é a visualização nítida de telas em tempo real, sem elementos dispensáveis de redes sociais.
- **Salas efêmeras por link:** Crie uma sala instantaneamente e compartilhe o link ou código (`/room/:roomId`). Capacidade padrão de 10 participantes por sala (configurável via `MAX_PARTICIPANTS_PER_ROOM`). Em desconexões involuntárias, a identidade e a vaga permanecem reservadas por 30 segundos para permitir reconexão transparente; saídas voluntárias liberam a vaga imediatamente, e salas sem participantes nem reservas ativas são destruídas da memória.
- **Acesso direto sem cadastro:** Visitantes entram imediatamente no navegador sem formulários de registro ou login.
- **Nicknames temporários opcionais:** Participantes podem definir ou atualizar um nome de exibição durante a sessão (mantido em `sessionStorage`), permanecendo como visitantes neutros caso prefiram.
- **Tela e áudio em sincronia:** Suporte a transmissão de vídeo e áudio da aba ou sistema com controle de mudo direto na interface.
- **Sem captura de microfone:** O microfone pessoal **nunca é solicitado, capturado ou gravado**. A aplicação utiliza exclusivamente a API nativa `navigator.mediaDevices.getDisplayMedia()`.
- **Múltiplas transmissões com palco dinâmico:** Se múltiplos participantes compartilharem a tela, o palco principal destaca uma transmissão com reprodutor em tamanho integral, enquanto as demais são exibidas em miniaturas clicáveis para alternância sem perda de conexão.
- **Perfis de qualidade e adaptação:** Prioridade Nitidez ou Fluidez, perfis Econômico, Equilibrado e Ultra e limites de 20/30/60 FPS conforme a combinação, com redução automática por perdas de envio. Veja a matriz em [PERFORMANCE.md](./PERFORMANCE.md).
- **Diagnóstico em tempo real:** Métricas de latência (RTT), perda de pacotes, bitrate e conexões ativas visíveis diretamente na interface da sala.

---

## Prévia, pausa e encerramento

**Compartilhar tela** abre o seletor nativo do navegador. A captura escolhida aparece em uma prévia local silenciosa, com indicação de áudio disponível. Nenhuma mídia é publicada antes de **Entrar ao vivo**. **Cancelar prévia**, fechar a prévia ou sair da sala encerra as tracks; uma nova tentativa solicita outra captura.

**Pausar** suspende o envio de vídeo e áudio, mantendo a captura do navegador. Os espectadores veem **Transmissão pausada**, inclusive ao entrar durante a pausa. **Retomar** reutiliza a captura válida e preserva o mudo; **Parar** encerra a captura definitivamente. O botão nativo de encerramento do navegador também funciona durante prévia e pausa. Uma falha ao suspender o envio encerra a captura por segurança.

## Modos de visualização

Na barra do palco, **Modo Cinema** recolhe o cabeçalho e as miniaturas para ampliar a transmissão dentro da página. O dock continua disponível; **Transmissões** permite abrir as miniaturas e trocar o destaque. O botão **Sair do Modo Cinema** restaura o layout. A preferência de Cinema e o zoom são preservados ao entrar e sair de tela cheia.

**Janela flutuante (PiP)** usa o vídeo principal na janela nativa do navegador, quando disponível. A ativação é manual; o controle fica indisponível quando o navegador ou o vídeo não permitem PiP. Trocar o destaque, pausar, substituir ou encerrar a transmissão e sair da sala encerram o PiP; uma nova ativação é manual. Reconexões que mantêm o stream não solicitam outra janela.

O PiP pode mostrar o vídeo sem zoom CSS, sobreposições ou controles da página. A disponibilidade e a coexistência com fullscreen dependem do navegador; o estado do controle acompanha os eventos nativos. Há detecção da API padrão e do modo de apresentação WebKit, sem garantia de suporte em todos os dispositivos.

## Estrutura do Monorepo

O projeto é estruturado como um monorepo gerenciado por `pnpm`:

```text
.
├── apps/
│   ├── web/           # Frontend TanStack Start (SSR), React 19, TypeScript e Mantine UI
│   └── signaling/     # Serviço Node.js para WebSocket (/signal) e credenciais TURN (/turn-credentials)
└── packages/
    └── protocol/      # Contratos de mensagens, schemas Zod, tipos, perfis de qualidade e validações
```

- **`apps/web`**: Interface web moderna com renderização híbrida/SSR via TanStack Start, componentes de interface Mantine, gerenciamento modular de conexões WebRTC (`PeerManager`), captura de mídia de exibição, métricas em tempo real, endpoint de verificação de integridade (`/healthz-web`) e painel de configurações.
- **`apps/signaling`**: Servidor de sinalização leve em Node.js com WebSocket em `/signal`, geração de credenciais temporárias TURN em `/turn-credentials`, validação rigorosa de origens (`ALLOWED_ORIGINS`) e endpoint de verificação de integridade (`/healthz`).
- **`packages/protocol`**: Biblioteca compartilhada de tipagens TypeScript, esquemas de validação Zod, regras de identificação de salas e perfis de qualidade de vídeo, garantindo compatibilidade entre cliente e servidor.

---

## Pré-requisitos

- **Node.js**: Versão 22 ou superior
- **pnpm**: 12.6.0, definida no `packageManager` do projeto. Utilize Corepack para gerenciar a versão.

---

## Instalação

Na raiz do repositório, instale as dependências de todos os pacotes:

```bash
pnpm install
```

---

## Desenvolvimento Local

Para iniciar o frontend e o servidor de sinalização em paralelo no modo de desenvolvimento:

```bash
pnpm dev
```

Por padrão:
- `apps/signaling` executa em `http://localhost:3000`
- `apps/web` executa em `http://localhost:3001` (com proxy do Vite encaminhando `/signal` e `/turn-credentials` para a porta 3000)

Acesse `http://localhost:3001` no navegador para utilizar a aplicação.

### Executar Serviços Isoladamente

Caso deseje executar apenas uma das partes:

```bash
pnpm dev:web         # apenas o frontend (porta 3001)
pnpm dev:signaling   # apenas o servidor de sinalização (porta 3000)
```

---

## Comandos do Workspace

| Comando | Descrição |
|---|---|
| `pnpm dev` | Inicia todos os aplicativos em paralelo em modo desenvolvimento |
| `pnpm dev:web` | Inicia o frontend em modo desenvolvimento (porta 3001 com proxy para 3000) |
| `pnpm dev:signaling` | Inicia o serviço de sinalização com recarregamento a quente (`tsx watch`) |
| `pnpm build` | Compila recursivamente todos os pacotes e aplicações do monorepo |
| `pnpm test` | Executa toda a suíte de testes automatizados do projeto |
| `pnpm typecheck` | Executa a verificação estática de tipos TypeScript em todo o monorepo |
| `pnpm start:web` | Inicia o servidor de produção do web (`node .output/server/index.mjs` via Nitro) |
| `pnpm start:signaling` | Inicia o serviço de sinalização compilado em modo de produção |
| `pnpm preview:web` | Executa o preview local de build do Vite |

---

## Arquitetura de Produção: Dois Serviços sob Mesma Origem

Em produção, `apps/web` e `apps/signaling` operam como processos desacoplados posicionados atrás de um **reverse proxy** que os expõe sob o mesmo domínio público.

O frontend comunica-se exclusivamente através de rotas relativas sob a mesma origem:
- `/signal` (WebSocket) -> encaminhado para `apps/signaling` (porta 3000)
- `/turn-credentials` (HTTP GET) -> encaminhado para `apps/signaling` (porta 3000)
- `/healthz` (HTTP GET) -> verificação de saúde do signaling (porta 3000)
- `/healthz-web` (HTTP GET) -> verificação de saúde do serviço web (porta 3001)
- `/*` (HTTP/SSR e arquivos estáticos) -> encaminhado para `apps/web` (porta 3001)

### Variáveis de Ambiente

#### `apps/web`
- `PORT`: Porta HTTP do servidor web/SSR (padrão: `3001`).
- `HOST`: Interface de rede para bind (padrão: `0.0.0.0`).
- `NITRO_PORT` / `NITRO_HOST`: Variáveis alternativas suportadas pelo runtime Nitro.

#### `apps/signaling`
- `PORT`: Porta do servidor de sinalização (padrão: `3000`).
- `HOST`: Interface de rede para bind (padrão: `0.0.0.0`).
- `ALLOWED_ORIGINS`: Lista separada por vírgula de origens autorizadas (ex.: `https://screen.example.com`). Em desenvolvimento, inclui fallbacks para localhost. Em produção, defina explicitamente o domínio público para evitar recusas `403 Forbidden`.
- `MAX_PARTICIPANTS_PER_ROOM`: Capacidade máxima de participantes simultâneos por sala (padrão: `10`).
- `TURN_SECRET`: Chave secreta compartilhada para geração de credenciais temporárias do coturn.
- `TURN_SECRET_FILE`: Caminho para arquivo no disco contendo a chave secreta (padrão: `/etc/screen-room/turn-secret`).
- `TURN_HOST`: Endereço IP ou hostname público do servidor coturn.

---

## Execução em Produção

### Via Node.js / pnpm

```bash
# 1. Compilar todo o projeto
pnpm build

# 2. Iniciar o serviço de sinalização (Terminal 1)
PORT=3000 ALLOWED_ORIGINS="https://screen.example.com" pnpm start:signaling

# 3. Iniciar o frontend web (Terminal 2)
PORT=3001 pnpm start:web
```

### Via Docker

Cada serviço possui seu próprio `Dockerfile`. Para proteger as portas internas e garantir acesso exclusivo via proxy reverso, os contêineres devem executar com `HOST=0.0.0.0` internamente (permitindo que recebam o tráfego encaminhado pela ponte do Docker), mas suas portas devem ser publicadas no host **estritamente na interface de loopback (`127.0.0.1`)**:

```bash
# Construir as imagens a partir da raiz do monorepo
docker build -f apps/signaling/Dockerfile -t screen-room-signaling .
docker build -f apps/web/Dockerfile -t screen-room-web .

# Executar os contêineres vinculados ao loopback do host (127.0.0.1)
docker run -d --name signaling \
  -p 127.0.0.1:3000:3000 \
  -e HOST=0.0.0.0 \
  -e ALLOWED_ORIGINS="https://screen.example.com" \
  screen-room-signaling

docker run -d --name web \
  -p 127.0.0.1:3001:3001 \
  -e HOST=0.0.0.0 \
  screen-room-web
```

---

## Exemplos de Proxy Reverso

### Exemplo 1: Caddy (`Caddyfile`)

```caddy
screen.example.com {
    # Sinalização WebSocket e credenciais TURN -> apps/signaling
    handle /signal* {
        reverse_proxy 127.0.0.1:3000
    }
    handle /turn-credentials* {
        reverse_proxy 127.0.0.1:3000
    }
    # Verificação de integridade do signaling (sem interceptar /healthz-web)
    @signaling_health path /healthz /health
    handle @signaling_health {
        reverse_proxy 127.0.0.1:3000
    }

    # Aplicação web, SSR e health check (/healthz-web) -> apps/web
    handle {
        reverse_proxy 127.0.0.1:3001
    }
}
```

### Exemplo 2: Nginx (`nginx.conf`)

```nginx
server {
    listen 80;
    server_name screen.example.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name screen.example.com;

    # Certificados SSL...

    # WebSocket de Sinalização
    location /signal {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 86400s;
    }

    # Credenciais TURN e Health Check do Signaling
    # Delimitador (/|$) impede captura indevida de /healthz-web ou /health-web do serviço web
    location ~ ^/(turn-credentials|healthz|health)(/|$) {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Frontend TanStack Start (SSR, Assets estáticos e /healthz-web)
    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

---

## Documentação Técnica Complementar

- [DEBUG.md](./DEBUG.md) — Procedimentos de diagnóstico na interface e ciclo de vida de sinalização e WebRTC.
- [PERFORMANCE.md](./PERFORMANCE.md) — Perfis de qualidade de vídeo, adaptação conservadora e limites da arquitetura mesh.
- [TURN.md](./TURN.md) — Mecanismos de credenciais temporárias TURN, configuração de firewall e comportamento de fallback.
- [DEPLOY.md](./DEPLOY.md) — Guia de implantação e operação em servidor VPS Linux com proxy reverso.

### Chat e reações efêmeros (F06 + F07)

Chat e reações usam o WebSocket da sala, inclusive sem transmissão. O servidor
atribui remetente, nickname, sala, horário e ID; o evento devolvido ao remetente
confirma aceitação pelo servidor (não leitura ou entrega a todos). Texto é exibido
literalmente. Quem entra depois não recebe mensagens anteriores.

Os limites ficam em `INTERACTION_LIMITS`, em `packages/protocol/src/messages.ts`:
texto com até 1000 unidades UTF-16, sem controles (exceto tab e quebra de linha)
ou controles direcionais; 5 envios de chat e 8 reações por participante a cada
janela móvel de 10 segundos. As cotas são independentes, somadas ao limitador geral
de 100 mensagens WebSocket por segundo. Tentativas duplicadas também consomem cota;
os últimos 64 IDs de solicitações são lembrados para impedir duplicação imediata.
Cotas e IDs acompanham a identidade durante substituição de socket e reserva de
reconexão, e são liberados ao sair ou expirar a reserva. Nenhum conteúdo de chat
é mantido pelo servidor ou incluído nos diagnósticos.

O cliente guarda até 200 mensagens apenas em memória, durante a sessão da sala,
e mostra até 6 reações por 3 segundos, respeitando movimento reduzido. O chat
permanece disponível no Cinema e dentro do contêiner de fullscreen do palco.
PiP nativo contém apenas o vídeo; use a janela da sala para conversar ou reagir.

Envios dependem de conexão e entrada confirmada na sala. Não há fila ou reenvio
após reconexão; uma interrupção ou timeout de 8 segundos informa que o envio não
foi confirmado. Uma confirmação tardia ainda pode aparecer no histórico, sem
promessa de recuperação. Reações são descartadas na desconexão; o histórico local
continua durante a reconexão, mas é limpo ao encerrar ou trocar a sessão/sala.

### Levantar a mão (F38)

Qualquer participante conectado pode levantar ou abaixar a própria mão pelo
controle junto ao chat e às reações, também no Cinema e em fullscreen. O contador
junto aos participantes considera apenas conexões ativas. Na lista, mãos levantadas
aparecem primeiro na ordem atribuída pelo servidor; os demais ficam em ordem de
identidade estável. O controle expõe `aria-pressed` e a lista identifica o estado
por ícone e texto.

O estado vive apenas na presença efêmera do signaling, sem relação com iniciar,
pausar, trocar ou encerrar compartilhamento. Entradas tardias recebem snapshot;
quedas involuntárias ocultam a mão até a recuperação autenticada dentro da reserva,
preservando a ordem original. Saída voluntária ou expiração descarta a solicitação.
O servidor associa a intenção ao socket ativo, valida versões para impedir reversões
obsoletas e limita tentativas a 6 por participante em janela móvel de 10 segundos
(`HAND_LIMITS`), inclusive durante recuperação. A interface aguarda confirmação;
não enfileira nem reenvia intenções após desconexão. Este slice da proposta F38
não inclui perguntas, enquetes, moderação ou permissões especiais.
