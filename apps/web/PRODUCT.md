# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Product Purpose

Janjalive oferece salas efêmeras sem cadastro para compartilhar tela e áudio da aba/sistema, com múltiplos apresentadores, colaboração e mídia P2P.

## Capabilities and Constraints

Tela/áudio usam `getDisplayMedia()`. Webcam opcional do apresentador usa somente vídeo (`getUserMedia()` com `audio: false`), subordinada à tela, com prévia privada e confirmação explícita. Não há captura de microfone. Arquivos e Watch Party usam consentimento individual; clipes de terceiros exigem autorização. A interface deve preservar privacidade, seleção de palco, reconexão e limpeza da sessão.

## Brand Commitments

Vídeo em primeiro plano, linguagem escura e azul, tipografia do sistema e componentes Mantine. Controles acessíveis em desktop/mobile, foco visível, rótulos claros e respeito a movimento reduzido. Consulte [DESIGN.md](DESIGN.md) e as [regras de contribuição](../../AGENTS.md).
