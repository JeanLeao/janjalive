## verdict

1. resolved — vertical-390 e vertical-320 agora mostram vídeo vertical inteiro, sem crop, timeline, reprodução, mute e volume juntos acima do dock. O vídeo mantém sua proporção e os comandos permanecem legíveis.
2. resolved — error-320 agora mostra integralmente “Codec ou arquivo incompatível. Escolha outro vídeo.” e mantém “Selecionar vídeo local” visível para recuperação. A rolagem parcial da navegação decorre da revelação do alerta, sem impedir essa tarefa.
3. resolved — horizontal-paused-1280/768 exibem “Reproduzir para todos” e horizontal-playing-desktop exibe “Pausar para todos”, com espaço visível.

4. resolved — deslocamento adicional de .modeEntry para top: 108px confirmado no seletor geral e mobile; return-320 recapturado mostra Watch Party inteira, separada de Clipes, sem sobrepor o ícone, título ou ações do estado vazio. A ausência de interceptação sobre “Ativar áudio” é sustentada pelo teste funcional informado pelo implementador; essa captura vazia não demonstra tal estado.

Regressões materiais introduzidas pelo lote: nenhuma observada nas sete recapturas novamente abertas após o deslocamento. Os três achados originais permanecem resolvidos. Não houve novo detector, execução de navegador ou ampliação da revisão.

## remaining

clear — ship cobre as três correções originais e a revisão visual do deslocamento de entrada pontuados neste verdict pass, não constitui nova revisão integral da superfície nem comprovação de permissões nativas, áudio real ou redes externas.

disposition: ship
