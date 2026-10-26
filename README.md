# Janjalive

Compartilhamento de tela e áudio da aba/sistema no navegador, sem cadastro, em salas efêmeras por link, código ou QR Code. A mídia usa WebRTC mesh P2P; o signaling mantém presença e coordenação em memória.

## Funcionalidades

- Prévia local e confirmação antes de transmitir; pausa, retomada, troca de origem e parada sem recarregar a página.
- Webcam opcional do apresentador, somente vídeo, com prévia e publicação explícita durante a apresentação de tela. Pausar ou encerrar a tela e desconectar desliga a câmera; trocar a origem da tela preserva a câmera ativa. Não há captura de microfone.
- Múltiplos apresentadores, seleção de palco, acompanhamento opcional das escolhas de outro apresentador, Comparar, Cinema, tela cheia, zoom e PiP conforme suporte do navegador. Webcam sobreposta, separada ou oculta; ocultar afeta apenas a visualização local.
- Perfis de qualidade Nitidez/Fluidez, limites de FPS, adaptação automática e diagnósticos de rede.
- Chat, reações, mão levantada, perguntas, enquetes e anotações efêmeras.
- Arquivos de até 20 MiB por P2P, com seleção de destinatários, aceitação individual e download explícito. Watch Party de MP4/WebM de até 20 MiB, com reprodução coordenada e volume individual.
- Capturas de imagem e clipes locais da tela; clipes de terceiros exigem consentimento. Webcam não integra imagens, clipes ou PiP.
- Host efêmero com bloqueio de entradas e remoção; chave de acesso opcional na criação, separada do link e da autoridade administrativa. Remoção não é banimento permanente.

O padrão é **10 vagas por sala**, configurável por `MAX_PARTICIPANTS_PER_ROOM`. Quedas involuntárias reservam identidade e vaga por **30 segundos**; saídas voluntárias liberam ambas imediatamente. A presença exibida conta somente conectados. Salas sem participantes nem reservas são eliminadas; reiniciar o signaling encerra todas as salas.

Credenciais de sala ficam no `sessionStorage` da aba e não integram convites. Sair pela interface limpa a sessão. A recuperação depende de credenciais válidas e da janela de reserva; não há histórico permanente de conta. O host precisa de armazenamento de sessão disponível para criar uma sala.

Captura e áudio dependem do navegador/SO e exigem contexto seguro (HTTPS ou localhost). Autoplay pode exigir interação no receptor. A saída de áudio depende das APIs disponíveis; sem suporte, use a configuração do sistema. Navegadores compatíveis permitem instalar o aplicativo pelo menu nativo, sem funcionamento offline nem persistência das salas.

## Requisitos e instalação

- Node.js 22+.
- pnpm na versão definida por `packageManager` em [package.json](package.json), atualmente 12.6.0.

```sh
corepack enable
corepack prepare pnpm@12.6.0 --activate
pnpm install --frozen-lockfile
```

## Desenvolvimento e estrutura

```sh
pnpm dev
```

Abra `http://localhost:3001`. O Vite encaminha `/signal` e `/turn-credentials` ao signaling local na porta 3000.

| Pacote | Responsabilidade |
| --- | --- |
| `apps/web` | React, TanStack Start/SSR, Mantine, captura e WebRTC |
| `apps/signaling` | WebSocket, presença, coordenação e credenciais TURN |
| `packages/protocol` | Schemas, tipos e parâmetros compartilhados |

| Comando na raiz | Finalidade |
| --- | --- |
| `pnpm dev:web` / `pnpm dev:signaling` | Desenvolvimento de cada serviço |
| `pnpm build` | Compilar o workspace |
| `pnpm typecheck` | Verificar tipos |
| `pnpm test` | Testes unitários e de integração |
| `pnpm start:web` / `pnpm start:signaling` | Executar os serviços compilados |
| `pnpm preview:web` | Preview local do build web |

Os testes web importam os builds de protocol/signaling. Prepare-os antes de testar em uma cópia limpa ou após alterar esses pacotes:

```sh
pnpm --filter @screen-room/signaling... build
pnpm test
pnpm --filter @screen-room/web exec playwright install chromium
pnpm --filter @screen-room/web test:e2e
```

Os E2E iniciam signaling e Vite nas portas 4310/4311 e usam captura sintética. Execute builds e E2E sequencialmente para evitar HMR e conflitos. Mocks e captura sintética não validam permissões nativas, áudio real, dispositivos físicos ou STUN/TURN entre redes distintas.

## Configuração e produção

Web e signaling são serviços distintos sob a mesma origem HTTPS, via proxy reverso:

| Rota pública | Destino |
| --- | --- |
| `/signal` (WebSocket), `/turn-credentials`, `/healthz` | Signaling, porta 3000 |
| `/healthz-web` e demais rotas HTTP/SSR/assets | Web, porta 3001 |

| Variável | Uso |
| --- | --- |
| `PORT`, `HOST` | Bind de cada serviço; portas padrão 3000 (signaling) e 3001 (web) |
| `NODE_ENV=production` | Execução de produção |
| `ALLOWED_ORIGINS` | Origens públicas autorizadas no signaling; definir explicitamente em produção |
| `MAX_PARTICIPANTS_PER_ROOM` | Capacidade da sala, padrão 10, incluindo reservas |
| `TRUSTED_PROXIES` | IPs/CIDRs dos proxies confiáveis; configure conforme a rede de implantação |
| `TURN_SECRET` ou `TURN_SECRET_FILE` | Segredo compartilhado com coturn; arquivo padrão `/etc/screen-room/turn-secret` |
| `TURN_HOST` | Host público do coturn, obrigatório quando houver segredo |
| `TURN_TTL_SECONDS` | Validade das credenciais TURN, padrão 3600 segundos |
| `VITE_SIGNALING_URL`, `VITE_TURN_URL` | Overrides de build web; normalmente mantenha as rotas da mesma origem |
| `VITE_ICE_TRANSPORT_POLICY=relay` | Build de validação com TURN obrigatório; omitir para seleção automática |

Sem segredo TURN disponível, o endpoint fornece somente STUN. A configuração TURN é carregada em memória; rotacionar o segredo exige reiniciar o signaling. Não versione segredos nem credenciais temporárias.

```sh
pnpm build
# Terminais separados, com o ambiente de produção configurado:
NODE_ENV=production pnpm start:signaling
NODE_ENV=production pnpm start:web
```

Configuração de TLS/proxy, Docker, systemd, firewall, atualização e verificações pós-deploy estão em [DEPLOY.md](DEPLOY.md). Para atravessar redes restritivas, configure e valide o [TURN](TURN.md); URLs TURN na resposta não comprovam relay funcionando.

## Documentação de manutenção

- [AGENTS.md](AGENTS.md): regras de contribuição, invariantes e validação.
- [DEBUG.md](DEBUG.md): diagnóstico de sinalização, mídia e reprodução.
- [PERFORMANCE.md](PERFORMANCE.md): perfis, adaptação e limites operacionais.
- [Benchmark local](apps/web/benchmark/README.md): execução e interpretação das medições.
- [Produto](apps/web/PRODUCT.md) e [design](apps/web/DESIGN.md): contexto atual para manutenção da interface.
- [Pendências jurídicas](docs/legal/README.md): confirmações necessárias antes de publicar as minutas.
