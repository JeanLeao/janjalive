# Qualidade e capacidade

## Perfis da tela

Fonte: `packages/protocol/src/quality.ts`. Padrão: **Nitidez · Equilibrado · 30 FPS**.

| Prioridade | Perfil | Resolução máxima | FPS selecionáveis | Bitrate máximo por conexão |
|---|---|---:|---|---:|
| Nitidez | Econômico | 1280×720 | 20 / 30 | 1,6 Mbps |
| Nitidez | Equilibrado | 1920×1080 | 20 / 30 | 3 Mbps |
| Nitidez | Ultra | 2560×1440 | 20 / 30 | 6 Mbps |
| Fluidez | Econômico | 1280×720 | 30 | 2 Mbps |
| Fluidez | Equilibrado | 1280×720 | 30 / 60 | 4 Mbps |
| Fluidez | Ultra | 1920×1080 | 30 / 60 | 8 Mbps |


São tetos configurados por destinatário, não garantias de entrega. Nitidez favorece resolução/texto; Fluidez favorece movimento. O navegador pode ignorar `contentHint` ou preferências de degradação. Fontes menores não são ampliadas; texto estático pode gerar poucos quadros mesmo com teto alto.

A captura solicita envelope de até 60 FPS; constraints e parâmetros dos senders aplicam a seleção. Alterar qualidade não recaptura nem muda áudio/mudo. Restrições impossíveis ou parâmetros rejeitados aparecem nos diagnósticos; a transmissão pode continuar sem aplicação integral. Ao mudar perfil/prioridade, o FPS é normalizado para uma opção válida.

## Adaptação da tela

A coleta ocorre a cada três segundos. A proteção usa a pior perda de **envio** entre espectadores, por deltas frescos de `remote-inbound-rtp` associados ao vídeo enviado; perda de recepção e médias entre peers não disparam a redução.

- Perda de envio **≥5%** reduz um nível, **Ultra → Equilibrado → Econômico**, com cooldown de **20 s**. Prioridade é preservada; FPS respeita o perfil resultante.
- Recuperação sobe um nível por vez até a preferência manual. Exige **60 s contínuos** com perda **<2% em todos os peers** e ao menos **60 s desde a última decisão automática**.
- Recuperação exige intervalos válidos com ao menos **100 pacotes**, recebimento positivo, contadores monotônicos e relatórios/coletas avançando com lacunas de no máximo **6 s**. RTT recente **>300 ms** bloqueia; RTT ausente isoladamente não bloqueia.
- Peer sem estatística válida, mudança de topologia/conexão, pausa, troca de fonte ou escolha manual invalidam a janela. Sem espectadores não há recuperação. Encerrar a captura descarta a redução temporária.

A gaveta distingue preferência manual, perfil temporário e verificação. `quality-downgrade`, `quality-stability-*`, `quality-recovery-attempt` e `quality-adaptation-*` ajudam a acompanhar decisões. Aceitação de parâmetros não comprova melhoria efetiva.

## Webcam opcional

A captura de vídeo tem teto de **640×360 a 15 FPS**. Os níveis de envio por destinatário estão em `apps/web/src/features/room/stats/camera-quality.ts`:

| Nível | Bitrate máximo | FPS máximo | Redução de resolução |
| --- | ---: | ---: | ---: |
| Inicial | 400 Kbps | 15 | 1× |
| Reduzido | 220 Kbps | 10 | 1,5× |
| Mínimo | 120 Kbps | 7 | 2× |

O fator se aplica à resolução capturada. Ajustes não recapturam e não garantem qualidade entregue. Novos peers recebem o nível vigente. A webcam tem observação própria, independente da adaptação da tela.

A coleta exige associação inequívoca ao sender, conexão/track ativas, timestamps frescos (até **6 s**), bytes monotônicos e avanço de frames codificados. Para perda/RTT, acumula intervalos válidos em janela móvel de aproximadamente **12 s**, até reunir ao menos **50 pacotes**; recebidos e perdidos podem incluir perda total. Intervalos inválidos ou sem tráfego interrompem a janela.

Uma amostra ruim exige perda acumulada **≥8% e perda do intervalo atual ≥8%**, RTT remoto **≥450 ms**, ou limitação de encoder por `cpu`/`bandwidth` com codificação ativa. Encoder pode fornecer evidência sem relatório remoto; FPS/bitrate baixos isoladamente não bastam.

Quatro amostras ruins consecutivas do mesmo destinatário em pelo menos **9 s** autorizam redução; cooldown global de **15 s**. Cada nível exige nova evidência. No mínimo, suspensão exige pelo menos **11 amostras ruins em 30 s**. Amostras boas/insuficientes, lacunas e transições interrompem a persistência.

Suspensão encerra a câmera e exibe aviso no dock. Não há recuperação ou reativação automática: nova ativação exige prévia e confirmação. Pausar/encerrar tela e desconectar encerram a câmera; trocar a origem da tela preserva o nível e reinicia a observação. Falha de publicação da câmera não encerra a tela. `camera-quality-*` distingue parâmetros solicitados/aceitos, medições, redução e suspensão.

Os limiares são experimentais e não foram calibrados para garantir desempenho em redes reais. A prioridade de reduzir a fonte secundária não adia a proteção necessária da tela.

## Medição e limites operacionais

`getSettings()` e parâmetros retornados confirmam configuração, não FPS codificado. `video-quality-stats` informa FPS/dimensões efetivos quando o navegador fornece esses campos. Estatística ausente não é zero; bitrate exige deltas compatíveis. O resumo da gaveta pode priorizar recepção; use detalhes por peer/direção para diagnosticar envio. Veja [DEBUG.md](DEBUG.md).

Em mesh, cada apresentador envia uma cópia por espectador: upload aproximado é bitrate efetivo × espectadores, mais áudio e overhead. Nove espectadores podem somar tetos de **54 Mbps** (Nitidez Ultra) ou **72 Mbps** (Fluidez Ultra), além de webcam. CPU, codificação e decodificação dependem do navegador e dispositivo. Dez vagas não são garantia de dez apresentadores simultâneos; não há SFU ou simulcast.

O [benchmark local](apps/web/benchmark/README.md) descreve medição isolada e suas limitações. Captura sintética e WebRTC local não comprovam permissões nativas, áudio real, TURN entre redes ou qualidade sob congestionamento real.
