# Diagnóstico de conexão e mídia

## Coleta inicial

1. Abra **Configurações → Rede & Métricas** na sala e registre o sintoma, navegador/SO, papel de cada participante e relação entre as redes.
2. Confira WebSocket, estados WebRTC/ICE/SDP e métricas por peer. A coleta ocorre a cada três segundos. Os eventos técnicos retêm somente os 50 registros mais recentes e podem ser copiados.
3. No servidor, acompanhe os logs com prefixo `[screen-room:signal]` (`pnpm dev:signaling` no desenvolvimento) e correlacione ingresso, saída, relay ou rejeição.

Compartilhe somente evidências sanitizadas. Não publique tokens, credenciais TURN, SDP, candidatos completos ou conteúdo privado das transmissões.

## Separar sinalização, transporte e reprodução

| Evidência | Interpretação |
| --- | --- |
| WebSocket conectado e presença atualizada | Signaling disponível; não comprova mídia |
| `offer-created`, `offer-received`, `answer-created`, `answer-received` | Negociação SDP; correlacionar com `pc-signaling` e descrições aplicadas |
| `pc-ice`, `pc-connection` em `connected` | Transporte estabelecido; não comprova vídeo reproduzido |
| `remote-track`, bytes recebidos e `framesDecoded` crescendo | Recepção e decodificação observadas |
| `first-frame` com `evidence=decoded` | Primeiro frame decodificado observado pelo coletor |
| `first-frame-presented` | Callback de `requestVideoFrameCallback()` do vídeo remoto no palco; frame enviado à composição |

`stable` sozinho pode ocorrer antes da negociação. Contadores acumulados não garantem fluxo contínuo. `first-frame-presented` não comprova visibilidade física ou continuidade; sem a API, apresentação permanece indeterminada. Prévia e miniaturas não geram esse evento. Troca de palco/stream ou pausa pode iniciar uma nova observação.

A contagem WebRTC usa `connectionState=connected`, mesmo sem RTP. Campos `–` indicam ausência de medição válida, não zero. Bitrate exige duas amostras compatíveis; perda sem tráfego não deve ser interpretada como 0%. O resumo pode priorizar recepção em peers bidirecionais; decisões de qualidade de envio usam relatórios remotos próprios. Consulte [PERFORMANCE.md](PERFORMANCE.md).

## Falhas comuns

| Sintoma | Próxima verificação |
| --- | --- |
| `signal-error`, HTTP 403 ou desconexão imediata | Disponibilidade do signaling, encaminhamento de `/signal` e `ALLOWED_ORIGINS` |
| HTTP 429 em `/turn-credentials` | Limite de 60 requisições/minuto por IP; IP efetivo e `TRUSTED_PROXIES` no [guia de implantação](DEPLOY.md) |
| Captura negada ou indisponível | Contexto seguro, suporte do navegador, permissão e fonte selecionada; `screen-capture-error` |
| Nenhuma oferta após selecionar a fonte | Confirmar **Entrar ao vivo** e existência de outro participante; a prévia não publica mídia |
| Oferta criada sem recepção | Eventos de envio/recepção e log `relay` do signaling |
| ICE preso em `checking` ou `failed` | Configuração ICE, conectividade e firewall; validar [relay TURN](TURN.md#validação-do-caminho-relay) |
| Vídeo sem áudio | Track de áudio da aba/sistema, mudo/volume, interação para autoplay e saída selecionada; não solicitar microfone |
| Câmera não inicia ou para | Tela ativa, confirmação da prévia, permissão de vídeo e aviso do dock; pausa, parada e desconexão encerram a câmera |
| Câmera reduzida ou suspensa | Eventos `camera-quality-*`; reativação é manual e a tela permanece independente |

`turn-config relay=true` significa que há URLs TURN configuradas, não que o par selecionado é relay. Estados ICE isolados não identificam a causa da falha.

## Encerramentos WebSocket

Os códigos terminais em `packages/protocol/src/messages.ts` impedem reconexão automática:

| Código | Motivo |
| --- | --- |
| 1000 / 1008 | Saída normal / violação de política |
| 4000 | Socket substituído por sessão autorizada |
| 4009 | Capacidade esgotada, incluindo reservas |
| 4401 / 4403 | Recuperação não autorizada / origem proibida |
| 4404 / 4408 / 4423 | Sala inexistente / participante removido / sala bloqueada |
| 4425 / 4426 / 4429 | Chave exigida / inválida / tentativas limitadas |

Quedas involuntárias acionam recuperação com token e reserva temporária de 30 segundos. Sair voluntariamente libera a vaga imediatamente. Uma aba não deve substituir outra sem credenciais válidas; credenciais administrativas do host são adicionais ao token de reconexão.

## Reprodução de problemas

Prepare protocol/signaling e o navegador conforme o [README](README.md#desenvolvimento-e-estrutura). Execute builds, testes e runners sequencialmente, com as portas 4310/4311 livres. Não feche o WebSocket HMR do Vite ao simular queda: interrompa somente `/signal` e observe novo snapshot de ingresso antes de verificar a recuperação.

```sh
pnpm --filter @screen-room/web test:e2e sharing.spec.ts --workers=1
pnpm --filter @screen-room/web exec playwright install firefox
E2E_BROWSER=firefox pnpm --filter @screen-room/web test:e2e sharing.spec.ts --workers=1
```

Para investigar falhas de vídeo, examine o anexo `playback-state`: transporte, bytes, frames, estado/erro do vídeo e callbacks de apresentação. Ausência de evento no histórico limitado não basta para concluir falha. Ao criar esperas de diagnóstico, use condições observáveis e relógio monotônico, evitando atrasos fixos.

Validação nativa exige dois clientes, entrada antes/depois da captura, parada/reinício, troca de origem, reconexão e múltiplos apresentadores. Confirme vídeo em movimento e áudio audível quando selecionado, separadamente de presença. Permissões, encerramento pelo navegador, câmera física, mobile real e travessia entre redes não são comprovados pela captura sintética. Para números comparáveis, use o [benchmark isolado](apps/web/benchmark/README.md).
