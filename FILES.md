# F15 — transferência de arquivos P2P

No **Chat**, use **Anexar arquivo**, escolha o arquivo e selecione de um a oito destinatários conectados. Revise nome, tamanho e destinatários e use **Solicitar envio**. A mensagem de texto pode ser composta e enviada independentemente do anexo. Qualquer participante pode enviar, incluindo espectadores sem mídia ativa. O controle do chat indica solicitações pendentes mesmo fechado e abre diretamente a aba Chat. Os cards são privados: cada destinatário vê somente sua entrega; o remetente vê um card agrupado com os resultados individuais. Nenhum metadado de arquivo é publicado no chat textual da sala. Cada destinatário aceita ou recusa a própria entrega. Fechar o painel não cancela transferências. A aceitação local permite receber blocos mesmo se o eco de aceitação no WebSocket chegar depois deles; conclusão e download continuam exigindo verificação local e confirmação válida do servidor. O progresso, cancelamento e resultado são individuais; uma recusa não afeta os demais. Após a verificação, **Baixar arquivo** salva localmente mediante ação explícita. **Dispensar** libera o arquivo recebido da memória.

## Transporte e consentimento

O signaling valida contratos estritos e autoriza somente participantes efetivamente conectados na mesma sala. A identidade vem do socket atual, nunca de um campo enviado pelo cliente. Ele encaminha metadados (inclusive nome, MIME declarado, tamanho e SHA-256) e controles; nenhum fragmento é enviado ao servidor. Autorizações são efêmeras, sem snapshots para novos participantes.

O `PeerManager` reutiliza a conexão de mídia existente ou negocia uma conexão de dados sob demanda. Não cria conexões entre espectadores ao entrar. Um canal confiável e ordenado, negociado no ID 0, por par evita duplicação quando pedidos são simultâneos. Entre espectadores sem mídia, o menor ID inicia a primeira oferta, evitando colisão inicial de SCTP; a negociação mantém serialização, rollback e gerações. A interrupção da conexão ou a troca de socket invalida as entregas; recuperação de mídia não retoma arquivos.

## Limites e segurança

- Até **20 MiB** por arquivo, inclusive vazio. Qualquer tipo é permitido para download; o MIME declarado não é usado para renderização. Nomes rejeitam caminhos, controles e caracteres de direção de texto. Não há abertura, execução ou interpretação automática.
- Um arquivo de saída pendente por vez, compartilhando a mesma referência `Blob` entre até oito destinatários. Um envio de bytes ativo por cliente; entregas aceitas ficam em fila, com estados e cancelamentos independentes.
- Até dois recebimentos aceitos ou arquivos retidos para download por cliente; dispense arquivos concluídos para liberar vagas. Até oito entregas pendentes por participante e 32 por sala no signaling.
- Blocos de até 16 KiB, reduzidos conforme o máximo SCTP negociado, com cabeçalho de identidade e offset. Buffer de saída limitado por backpressure em 128 KiB (mais um bloco); retomada em 64 KiB por `bufferedamountlow`. Pausa de 8 ms entre blocos (~2 MiB/s nominal) para compartilhar recursos com mídia.
- Verificação de ordem, tamanho exato e SHA-256 no destinatário. O download só aparece após a verificação local e confirmação do controle. A declaração do remetente nunca basta para concluir.
- Pedido expira em 60 s; entregas aceitas podem aguardar na fila por até 10 minutos, dentro da autorização absoluta do servidor. Conexão do canal, inatividade após o início dos bytes e confirmação expiram em 30 s. Autorização aceita tem duração absoluta máxima de 10 minutos no servidor.
- Até 16 pedidos por minuto por socket; até 256 IDs de pedido distintos durante a conexão. IDs duplicados são rejeitados. O limite geral de mensagens WebSocket e o payload máximo de 64 KiB continuam aplicados; os schemas de F15 aceitam somente controles pequenos, sem campos adicionais.
- Desconexão, saída, moderação, fechamento da aba, falha do canal, timeout ou cancelamento descartam recebimentos incompletos. Não há retomada; nova tentativa exige novo pedido e consentimento. A perda da própria conexão com a sala limpa também arquivos recebidos ainda não salvos; downloads já salvos não são afetados.

Arquivos, fragmentos e histórico não são persistidos pelo aplicativo no servidor nem no armazenamento permanente do navegador. Downloads explicitamente salvos pertencem ao usuário. As autorizações e metadados pendentes ficam apenas em memória no signaling. SHA-256 verifica correspondência com o arquivo anunciado, sem atestar a segurança do conteúdo ou a identidade civil do remetente.

## Conectividade e limitações

Depende de WebRTC P2P/STUN/TURN, como a mídia; TURN pode retransmitir tráfego criptografado sem armazenar arquivos. Falhas de rede ou políticas do navegador podem impedir a conexão. Requer contexto seguro e suporte a RTCDataChannel e Web Crypto. Downloads e nomes finais dependem das políticas do navegador/SO.

Cada recebimento aceito reserva um buffer fixo do tamanho anunciado (até 20 MiB), evitando multiplicação de objetos mesmo com fragmentos pequenos. Os recebimentos ficam em memória e o cálculo SHA-256 via Web Crypto cria um buffer temporário de até 20 MiB. Blobs e buffers de verificação podem elevar temporariamente o uso acima dos 40 MiB de arquivos recebidos retidos; não se trata de streaming direto para disco. Dispositivos com pouca memória podem falhar, e o pacing não garante qualidade de mídia em redes congestionadas. Não foram adicionadas dependências, armazenamento persistente ou serviços externos.

O transporte aceita `Blob` com nome explícito. A prévia F16 de uma gravação da própria transmissão oferece **Enviar no Chat**: prepara o Blob original como anexo, sem download intermediário, e abre a aba Chat. O envio exige seleção de até oito destinatários e **Solicitar envio**, com aceitação individual pela F15. Clipes acima de 20 MiB mantêm Salvar/Descartar, mas não podem ser preparados. Um anexo existente precisa ser removido antes de encaminhar um clipe. Descartar a prévia antes de confirmar remove o anexo correspondente; após solicitar, a F15 mantém o Blob enquanto houver entregas dependentes. Fechar o Chat ou trocar o modo de apresentação preserva o anexo; desconexão ou mudança de sala o invalida. Clipes de terceiros não oferecem o fluxo integrado; consentimento de gravação não é autorização de redistribuição. F16 → F14 permanece fora do escopo.

## Validação

`apps/web/e2e/files.spec.ts` usa três contextos de navegador, WebRTC real local e download binário comparado ao original. Os testes de compartilhamento usam captura sintética. Testes unitários verificam consentimento, tamanho, ordem, hash, backpressure, cancelamento e timers; testes de protocolo e signaling verificam schemas, isolamento e invalidação de autorizações. Essas verificações não comprovam permissões nativas, áudio real ou TURN entre redes distintas.

Para executar somente os cenários F15, após preparar os builds do workspace:

```sh
pnpm --filter @screen-room/web test:e2e files.spec.ts --workers=1
E2E_BROWSER=firefox pnpm --filter @screen-room/web test:e2e files.spec.ts --workers=1
```

Os cenários incluem o mesmo arquivo de 20 MiB concluído por dois destinatários no desktop, comparação binária dos downloads, viewport móvel com toque, pedidos bidirecionais e cancelamentos independentes. A emulação não substitui dispositivos físicos ou leitores de tela reais.
