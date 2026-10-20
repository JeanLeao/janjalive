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

## Host efêmero e moderação (F11)

**Criar sala** solicita a criação ao signaling por WebSocket (`create-room`). O servidor gera um código aleatório de 128 bits e uma credencial administrativa independente de 256 bits, mantidos somente em memória. O primeiro visitante não recebe autoridade. Uma criação não reivindicada expira após 60 segundos; se convidados já estiverem conectados, a sala continua sem administrador, com a credencial revogada. A criação respeita origens permitidas, o limite de mensagens e um limite adicional de 10 salas por minuto por IP (resolução via proxies confiáveis, sem confiar livremente em `X-Forwarded-For`). O mapa desse limite aceita até 10.000 IPs por janela.

A credencial administrativa fica no `sessionStorage` da aba, isolada por sala, junto da identidade e do token de reconexão. Não integra links, códigos, QR Codes, snapshots públicos ou diagnósticos. No primeiro ingresso autorizado, o servidor vincula o host à identidade do criador. Reconexões seguintes exigem **ambas** as credenciais; o token de reconexão sozinho não concede administração. Recarregar a página pode recuperar a sessão dentro dos 30 segundos de reserva. Sair pela interface revoga a autoridade imediatamente e limpa o armazenamento da sala. O armazenamento de sessão precisa estar disponível para criar uma sala; convidados podem continuar com recuperação em memória quando ele estiver indisponível.

Em **Participantes**, o host pode **Bloquear entradas**, **Desbloquear entradas** e **Remover** outros participantes, com confirmação e feedback. A identificação do host e o bloqueio são públicos. Comandos usam a sessão WebSocket ativa, revisão autoritativa e identificação de requisição; mudanças de presença invalidam comandos antigos, e sockets substituídos perdem autorização. O snapshot de ingresso/reconexão inclui o estado administrativo. A sala bloqueada aceita apenas recuperações autenticadas de identidades ativas ou reservadas, mantendo a capacidade padrão de 10 vagas, incluindo reservas.

Remover encerra a sessão, libera a vaga e invalida o token anterior; o cliente limpa a mídia e não tenta reconectar automaticamente. **Não há banimento permanente:** sem contas, uma pessoa pode entrar com nova identidade enquanto a sala estiver aberta. Bloquear entradas é o mecanismo complementar. Uma remoção não pode apagar mídia que outro navegador já tenha recebido por P2P; o servidor impede a continuidade daquela sessão no signaling, e os clientes encerram as conexões correspondentes.

Quedas involuntárias reservam a autoridade por 30 segundos. Expiração ou saída voluntária revogam a credencial e desbloqueiam a sala ocupada, sem promover outro participante. Sem participantes nem reservas, todo o estado é destruído. Salas inexistentes/encerradas rejeitam ingresso com orientação para criar outra sala; `join` nunca cria salas. Bloqueio, remoção, sala inexistente e recuperação inválida têm encerramentos terminais, sem loop de reconexão. Reiniciar o signaling encerra todas as salas e autoridades, como os demais estados efêmeros. Web, signaling e protocolo devem ser atualizados juntos.

## Prévia, pausa e encerramento

**Compartilhar tela** abre o seletor nativo do navegador. A captura escolhida aparece em uma prévia local silenciosa, com indicação de áudio disponível. Nenhuma mídia é publicada antes de **Entrar ao vivo**. **Cancelar prévia**, fechar a prévia ou sair da sala encerra as tracks; uma nova tentativa solicita outra captura.

**Pausar** suspende o envio de vídeo e áudio, mantendo a captura do navegador. Os espectadores veem **Transmissão pausada**, inclusive ao entrar durante a pausa. **Retomar** reutiliza a captura válida e preserva o mudo; **Parar** encerra a captura definitivamente. O botão nativo de encerramento do navegador também funciona durante prévia e pausa. Uma falha ao suspender o envio encerra a captura por segurança.

## Modos de visualização

Com pelo menos duas transmissões, **Comparar** abre dois painéis equivalentes lado a lado no desktop e empilhados com rolagem no mobile. **Principal** continua vinculada ao palco e ao acompanhamento de apresentadores; **Secundária** é uma escolha local e sempre sem áudio. Cada painel tem zoom e arraste independentes e exibe suas próprias anotações; somente o principal oferece ferramentas de anotação, PiP e captura de imagem. Cinema e tela cheia abrangem os dois painéis. **Sair da comparação** restaura o palco; isso também acontece quando resta apenas uma transmissão elegível.

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

### Levantar a mão, Perguntas e Enquetes (F38)

Qualquer participante conectado pode levantar ou abaixar a própria mão pelo
controle junto ao chat e às reações, também no Cinema e em fullscreen. O contador
junto aos participantes considera apenas conexões ativas. Na lista, mãos levantadas
aparecem primeiro na ordem atribuída pelo servidor; os demais ficam em ordem de
identidade estável. O controle expõe `aria-pressed` e a lista identifica o estado
por ícone e texto.

O estado de mãos vive apenas na presença efêmera do signaling, sem relação com iniciar,
pausar, trocar ou encerrar compartilhamento. Entradas tardias recebem snapshot;
quedas involuntárias ocultam a mão até a recuperação autenticada dentro da reserva,
preservando a ordem original. Saída voluntária ou expiração descarta a solicitação.
O servidor associa a intenção ao socket ativo, valida versões para impedir reversões
obsoletas e limita tentativas a 6 por participante em janela móvel de 10 segundos
(`HAND_LIMITS`), inclusive durante recuperação.

O painel de interações inclui a aba **Perguntas**, acessível mesmo
sem transmissões ativas, em desktop, mobile, Modo Cinema e fullscreen:

- Qualquer participante conectado pode enviar perguntas e retirar apenas a própria pergunta.
- Perguntas pertencem à sala (não a uma transmissão específica) e permanecem enquanto a sala existir, mesmo que o autor saia ou um apresentador interrompa a transmissão, sendo descartadas apenas quando a sala é destruída (respeitando reservas de reconexão).
- Perguntas abertas são exibidas antes das respondidas, mantendo a ordem previsível de chegada atribuída pelo servidor (`order`) e sincronizadas por `questions-snapshot` (com `revision` monotônica) na entrada tardia e reconexão.
- Participantes que estão compartilhando tela (`sharing.active === true`, inclusive em pausa) podem responder por texto, marcar como respondida ao vivo, reabrir ou destacar uma pergunta por vez na sala. Múltiplos apresentadores têm as mesmas capacidades.
- Limites em `QA_LIMITS` (`packages/protocol/src/messages.ts`): pergunta até 500 caracteres, resposta até 1000 caracteres, máximo de 100 perguntas por sala e até 8 ações de Q&A por participante a cada 10 segundos (com deduplicação dos últimos 64 `requestId`, preservada em substituição de socket e reserva de reconexão).
- **Limitação conhecida do modelo de confiança:** como o estado de compartilhamento (`update-sharing`) é anunciado pelo cliente no modelo atual sem contas ou papéis permanentes, a verificação de apresentador no servidor reflete o estado anunciado na sala e não constitui autenticação forte de apresentador.


#### Enquetes rápidas

O painel mantém as abas **Chat | Perguntas | Enquetes**, inclusive no Modo Cinema e em tela cheia. Um ponto discreto no acesso às interações indica uma enquete aberta; ela nunca é aberta automaticamente sobre o vídeo.

- Qualquer apresentador com compartilhamento ativo (inclusive pausado, como no Q&A) pode criar ou encerrar uma enquete. Há uma única enquete aberta por sala. Parar a transmissão ou sair não encerra a votação.
- Todos podem escolher uma alternativa e confirmar em **Votar**, alterando o voto enquanto a enquete estiver aberta. Resultados ao vivo ficam disponíveis após votar ou durante compartilhamento ativo. Enquetes encerradas mostram os resultados finais para todos, com quantidades, percentuais arredondados e indicação do próprio voto. O arredondamento independente pode produzir soma diferente de 100%.
- O servidor guarda uma identidade privada de votação, independente do identificador público do participante, e a preserva em substituições autorizadas de socket e reservas de reconexão. Votos de quem saiu continuam nos totais. Uma saída voluntária ou uma nova sessão após expirar a reserva cria uma nova identidade; não há proteção absoluta contra uma pessoa criar novas identidades.
- `create-poll`, `vote-poll` e `close-poll` têm validação estrita e identidade derivada do socket atual. Snapshots `polls-snapshot` são personalizados por destinatário e versionados por um relógio monotônico do servidor: contêm apenas o próprio voto e, quando autorizado, totais agregados, nunca a lista de votantes ou identidades privadas. A versão pode avançar sem mutação, por exemplo ao sincronizar ou alterar elegibilidade.
- Limites em `POLL_LIMITS`: pergunta de 1 a 300 caracteres, 2 a 5 alternativas de 1 a 120 caracteres; espaços nas extremidades são removidos e caracteres de controle/bidirecionais são rejeitados. Até 8 ações de enquetes por identidade em 10 segundos, independentes do Q&A, com deduplicação dos últimos 64 pedidos. O orçamento é preservado durante reconexão válida.
- A memória retém uma enquete aberta e até 3 encerradas (mais recentes primeiro), com até 10.000 identidades votantes por enquete, incluindo quem saiu; ao atingir esse teto, novos votantes são recusados, mas votos existentes podem ser alterados. Os totais derivam de escolhas individuais, sem incrementos duplicados. Os textos limitam cada criação a 900 caracteres de conteúdo; o limite de frame WebSocket existente permanece em 64 KiB.
- Todos os dados ficam somente em memória e são descartados quando a sala é destruída, após encerrar eventuais reservas de recuperação. Não há exportação, banco de dados, host ou moderação permanente.
- A interface aguarda confirmação por até 8 segundos, exibe erros ou desconexão e não reenvia operações automaticamente. A entrada tardia e a reconexão recebem o estado atual; rascunhos de criação sobrevivem a mudanças de modo dentro da mesma sala.
