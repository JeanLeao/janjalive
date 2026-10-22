export interface LegalSection { id: string; title: string; paragraphs: string[] }
export interface LegalDocument { title: string; description: string; sections: LegalSection[] }
export const DOCUMENT_VERSION = '0.1 — minuta';
export const REVIEW_DATE = '2026-10-22';
export const terms: LegalDocument = {
  title: 'Termos de Uso',
  description: 'Condições de uso das salas, transmissões e ferramentas do Janjalive. Minuta para revisão.',
  sections: [
    { id: 'servico', title: 'O serviço e seu responsável', paragraphs: [
      'O Janjalive oferece salas temporárias, sem cadastro, para compartilhar tela e áudio da aba ou do sistema, conversar, enviar arquivos e assistir juntos a vídeos locais. Este documento descreve as condições propostas para seu uso.',
      'Pendente de confirmação: identificação do responsável legal pelo serviço e canal oficial de contato. Esta versão é uma minuta local, sujeita à confirmação operacional e à revisão jurídica antes da publicação definitiva.'
    ] },
    { id: 'participacao', title: 'Criação e participação em salas', paragraphs: [
      'Você pode criar uma sala ou entrar por convite, usando um nickname opcional. O nickname não comprova identidade. Compartilhe o convite apenas com as pessoas desejadas. Quando houver proteção por chave, envie a chave com cuidado e separadamente do convite.',
      'A participação depende da capacidade da sala, de sua disponibilidade e dos controles de entrada. Uma queda involuntária pode reservar temporariamente a vaga para reconexão; isso não garante acesso permanente. Não use a sala como arquivo ou repositório de informações.'
    ] },
    { id: 'responsabilidades', title: 'Responsabilidades dos participantes', paragraphs: [
      'Use o serviço de forma lícita e respeitosa. Você responde pelas decisões de compartilhar conteúdo e deve ter as autorizações necessárias, inclusive de pessoas cujas imagens, vozes ou dados apareçam na transmissão. Evite expor dados sensíveis, senhas, documentos e notificações privadas.',
      'Cabe ao responsável pelo serviço operar a plataforma e cumprir as obrigações legais que lhe forem aplicáveis. As responsabilidades dos participantes pelo conteúdo não afastam as responsabilidades próprias de quem oferece o serviço.'
    ] },
    { id: 'compartilhamento', title: 'Tela, áudio e conteúdos compartilhados', paragraphs: [
      'A captura depende da sua escolha no seletor do navegador e da confirmação na interface. Ela usa a tela, janela ou aba escolhida e, quando disponível, o áudio da aba ou do sistema. O aplicativo não solicita câmera nem microfone pessoal.',
      'Confira a fonte antes de transmitir. Você pode encerrar a captura pelo aplicativo ou pelo navegador. Parar o compartilhamento não apaga cópias ou gravações já feitas pelos destinatários.'
    ] },
    { id: 'clipes', title: 'Gravações, clipes e consentimento', paragraphs: [
      'O gravador integrado permite clipes locais de até 60 segundos, com permissão do apresentador. Solicite também as autorizações necessárias das demais pessoas envolvidas no conteúdo. A permissão técnica do apresentador não substitui essas autorizações.',
      'O apresentador pode revogar a permissão do gravador integrado. Isso não elimina clipes já salvos, nem impede ferramentas externas de captura ou gravação. Não grave ou divulgue conteúdo em violação à privacidade ou aos direitos de terceiros.'
    ] },
    { id: 'arquivos', title: 'Arquivos e Watch Party', paragraphs: [
      'Arquivos de até 20 MiB são oferecidos a destinatários selecionados, que podem aceitar ou recusar. Verifique a origem e o conteúdo antes de abrir um arquivo. Não há promessa de inspeção antivírus dos arquivos recebidos.',
      'A Watch Party distribui um vídeo local compatível, MP4 ou WebM de até 20 MiB, mediante aceite individual. Quem inicia coordena a reprodução; o volume é individual e a sincronização pode variar. Enviar um arquivo ou vídeo não concede direitos sobre ele aos demais participantes além daqueles que você possa legitimamente autorizar.'
    ] },
    { id: 'direitos', title: 'Conteúdos de terceiros e direitos autorais', paragraphs: [
      'Compartilhe apenas conteúdos próprios, licenciados ou cujo uso seja permitido pela legislação. Não retransmita obras, eventos ou materiais protegidos sem autorização quando ela for necessária. Você continua responsável por respeitar licenças, imagem, privacidade e outros direitos dos titulares.',
      'O serviço não adquire a propriedade do conteúdo compartilhado. O processamento e a transmissão necessários aos recursos escolhidos não significam autorização geral para explorar ou publicar esse conteúdo.'
    ] },
    { id: 'condutas', title: 'Condutas proibidas', paragraphs: [
      'Não use o Janjalive para atividades ilícitas, ameaças, assédio, discriminação, exploração de pessoas, divulgação não autorizada de dados ou distribuição de programas maliciosos. Não se passe por outra pessoa nem viole direitos de terceiros.',
      'Não tente contornar chaves, bloqueios, limites de requisições ou permissões. Não explore vulnerabilidades, comprometa conexões de outros participantes ou sobrecarregue o serviço.'
    ] },
    { id: 'moderacao', title: 'Moderação e encerramento', paragraphs: [
      'Os controles da sala permitem ao anfitrião administrar o ingresso, bloquear novas entradas, remover participantes e encerrar a sala, conforme as opções disponíveis. Há limites automáticos para determinadas operações. Isso não representa fiscalização contínua ou revisão prévia de todo conteúdo pelo responsável pelo serviço.',
      'Salas e estados de colaboração são temporários. O encerramento da sala ou uma ação de moderação não apaga arquivos, clipes ou outras cópias já recebidas em dispositivos de participantes.'
    ] },
    { id: 'limites', title: 'Disponibilidade e limites técnicos', paragraphs: [
      'O funcionamento depende do navegador, do sistema operacional, da rede e dos demais participantes. Captura de áudio e tela, reprodução automática, gravação e formatos de vídeo podem não estar disponíveis, especialmente em dispositivos móveis.',
      'WebRTC pode usar conexões diretas ou retransmissão TURN. Quedas, atrasos e falhas de sincronização podem ocorrer. Não há garantia de disponibilidade ininterrupta ou de adequação a atividades que exijam continuidade crítica.'
    ] },
    { id: 'responsabilidade-legal', title: 'Responsabilidade e direitos legais', paragraphs: [
      'Cada parte responde por seus atos e omissões conforme a legislação aplicável. Estes termos não excluem direitos obrigatórios dos usuários, nem afastam responsabilidades que a lei não permita limitar. A aplicação das regras de proteção ao consumidor e de proteção de dados deve ser avaliada conforme a operação concreta.',
      'A proposta considera a legislação brasileira. A revisão jurídica deverá confirmar as disposições aplicáveis, sem impor renúncia de direitos ou foro que prejudique garantias legais.'
    ] },
    { id: 'atualizacoes', title: 'Atualizações e contato', paragraphs: [
      'Mudanças nos recursos ou na operação podem exigir nova versão destes termos. A versão publicada deverá informar sua data efetiva e comunicar alterações relevantes de modo adequado. A data de revisão desta minuta não é uma data de publicação ou de início de vigência.',
      'Pendente de confirmação: canal oficial para dúvidas, relatos de uso indevido e solicitações. A Política de Privacidade complementa estes termos quanto ao tratamento de dados pessoais.'
    ] },
  ],
};
export const privacy: LegalDocument = {
  title: 'Política de Privacidade',
  description: 'Como as salas e ferramentas do Janjalive tratam dados. Minuta baseada na implementação verificada.',
  sections: [
    { id: 'responsavel', title: 'Responsável e alcance desta política', paragraphs: [
      'Esta minuta descreve os tratamentos identificados no código do Janjalive. A ausência de cadastro não significa ausência de dados pessoais: nicknames, endereços IP e conteúdos compartilhados podem identificar pessoas.',
      'Pendente de confirmação: identificação do controlador, contato de privacidade e, quando aplicável, informações sobre o encarregado. A operação de produção e os fornecedores precisam ser conferidos antes da publicação definitiva.'
    ] },
    { id: 'dados', title: 'Dados de participação e conectividade', paragraphs: [
      'O serviço trata o nickname opcional, identificadores de sala e participante, credenciais de administração, chave de acesso quando utilizada, token de reconexão, presença, permissões e estados dos recursos. Esses dados permitem criar e administrar salas, identificar mensagens e recuperar conexões.',
      'São tratados endereços IP, dados de sinalização e negociação WebRTC, candidatos de conectividade e informações técnicas de conexão e qualidade. O servidor usa IPs para limitar requisições e tentativas de acesso; determinados eventos registram IP, identificadores de sala e participante, origem e informações de erro.'
    ] },
    { id: 'finalidades', title: 'Finalidades e bases legais em revisão', paragraphs: [
      'Participação e sessão: os dados de identificação temporária, presença, mensagens e permissões viabilizam os recursos solicitados. A execução de contrato ou de procedimentos a pedido do titular é uma hipótese a avaliar para esses tratamentos.',
      'Segurança e conectividade: IPs, limites de requisições e diagnósticos ajudam a prevenir abuso e estabelecer conexões. O legítimo interesse é uma hipótese a avaliar, com análise de necessidade, proporcionalidade e direitos dos titulares. Obrigações legais específicas só poderão justificar retenção quando efetivamente aplicáveis e identificadas.',
      'Clipes e recebimento de arquivos ou vídeos têm controles de permissão na interface. Esse aceite técnico não define, por si só, a base legal de todos os dados presentes no conteúdo. Consentimento, quando aplicável, deve atender aos requisitos legais. O proprietário e a revisão jurídica devem confirmar o enquadramento de cada finalidade, inclusive para dados sensíveis e dados de crianças e adolescentes; nenhuma base legal está definitivamente validada nesta minuta.'
    ] },
    { id: 'navegador', title: 'Armazenamento no navegador e cookies', paragraphs: [
      'O sessionStorage guarda o nickname, dados de sessão por sala (incluindo identificador, credenciais, token de reconexão e chave quando aplicáveis) e o estado de exibição do aviso da chave. Ele é associado à sessão da aba; restaurações e cópias de abas dependem do navegador. A saída remove dados de sessão conforme o fluxo do aplicativo, mas não implica apagar todas as preferências.',
      'O localStorage guarda a preferência de ativação dos atalhos de teclado e pode persistir entre visitas até sua remoção pelo navegador. Você pode limpar os dados do site nas configurações do navegador; isso pode impedir a recuperação da sessão e apagar preferências.',
      'Na implementação examinada não foram identificados cookies de rastreamento, ferramentas de analytics, pixels de publicidade, IndexedDB ou service worker. Isso não comprova sua ausência na infraestrutura ou em serviços associados em produção. Cookies e demais mecanismos eventualmente adicionados por esses serviços precisam ser confirmados. Esta entrega não introduz rastreamento nem banner de cookies.'
    ] },
    { id: 'transporte', title: 'WebSocket, WebRTC, STUN e TURN', paragraphs: [
      'WebSocket transporta sinalização, presença, chat e eventos de colaboração até o servidor. WebRTC transporta a mídia e os dados de arquivos e vídeos entre navegadores, podendo usar TURN como retransmissor quando necessário ou conforme a configuração. Portanto, nem todo tráfego é direto entre participantes.',
      'STUN auxilia a descoberta de endereços de rede e recebe informações de conectividade, como o IP de quem o consulta. O código prevê STUN público do Google e, na contingência do cliente, também da Twilio. O uso efetivo depende da configuração e do êxito da consulta de credenciais. O provedor TURN também pode tratar IPs e metadados de conexão.',
      'Outros participantes podem obter informações de conectividade associadas à sessão WebRTC. Não há promessa de anonimato absoluto. A criptografia de transporte WebRTC não equivale a afirmar que chat e todos os recursos têm criptografia ponta a ponta; o servidor processa as mensagens de colaboração.'
    ] },
    { id: 'conteudos', title: 'Chat, colaboração e conteúdos locais', paragraphs: [
      'Textos de chat, reações, perguntas, votos, enquetes, ações de moderação e colaboração são processados pelo servidor e entregues conforme os recursos da sala. Perguntas, enquetes e estados de participação são mantidos em memória para o funcionamento da sessão. O código de chat examinado retransmite mensagens, sem histórico persistente no servidor; os clientes mantêm o conteúdo recebido em memória.',
      'Os bytes de arquivos, vídeos da Watch Party e clipes compartilhados usam canais WebRTC. A sinalização processa metadados como nome, tipo, tamanho, hash de integridade, destinatários, permissões e estado das transferências ou reprodução. Não foi identificado upload desses bytes para armazenamento persistente no servidor da aplicação.',
      'Clipes são gravados localmente com o mecanismo integrado e permissão do apresentador. Arquivos e vídeos exigem aceite individual para recebimento. Participantes podem salvar arquivos e clipes no dispositivo. Essas cópias não são eliminadas ao fechar a sala e ficam sob controle de quem as recebeu. O aplicativo não impede gravações externas nem consegue apagar todas as cópias de terceiros.'
    ] },
    { id: 'retencao', title: 'Memória temporária, logs e eliminação', paragraphs: [
      'O estado das salas e controles de recursos é mantido em memória no processo de sinalização. A limpeza varia por recurso e pelo ciclo da sala; não se trata de uma política única de retenção. A reserva padrão de reconexão é de 30 segundos e pode ser configurada. Esse prazo não representa o prazo de guarda de mensagens, arquivos ou logs.',
      'O cliente mantém diagnósticos recentes em memória (limite padrão de 50 entradas) e também os escreve no console do navegador. O servidor escreve eventos no console. Os registros podem conter nicknames, identificadores e informações técnicas; IPs aparecem em alguns eventos de limite ou recusa de acesso.',
      'Pendente de confirmação: coleta, acesso, retenção, rotação, backups e eliminação dos logs de aplicação, proxy reverso, hospedagem e STUN/TURN. Não é possível afirmar que encerrar a sala elimina os registros da infraestrutura. Prazos e eventuais obrigações de conservação precisam ser definidos e documentados antes da publicação.'
    ] },
    { id: 'terceiros', title: 'Destinatários, fornecedores e outros países', paragraphs: [
      'Os participantes recebem os conteúdos destinados a eles. A infraestrutura de hospedagem, proxy, sinalização e conectividade pode tratar dados necessários ao serviço. Os endpoints públicos STUN identificados envolvem Google e Twilio; isso não identifica todos os fornecedores efetivamente utilizados.',
      'Pendente de confirmação: fornecedores contratados, papéis no tratamento, países de processamento, subprocessadores e garantias aplicáveis a eventuais transferências internacionais. O uso de serviços externos ou participantes em outros países pode envolver tratamento fora do Brasil; não se afirma que todos os dados permaneçam no país.'
    ] },
    { id: 'seguranca', title: 'Segurança e seus limites', paragraphs: [
      'A implementação inclui validação de mensagens, restrições de origem configuráveis, limites de operações, tokens de reconexão, controles de permissão e credenciais TURN temporárias quando configuradas. Essas medidas reduzem riscos, mas não garantem inviolabilidade. HTTPS e a configuração efetiva da infraestrutura precisam ser mantidos na operação.',
      'Proteja os convites, chaves e dispositivos. Revise o que está visível antes de compartilhar e evite conteúdos sensíveis. A proteção de entrada não substitui a confiança nas pessoas que recebem o conteúdo.'
    ] },
    { id: 'direitos', title: 'Direitos e solicitações', paragraphs: [
      'Nos termos e condições da LGPD, o titular pode solicitar confirmação de tratamento, acesso, correção, informações sobre compartilhamento, anonimização, bloqueio ou eliminação de dados desnecessários ou tratados irregularmente, além de portabilidade quando aplicável, oposição e revisão de decisões automatizadas quando cabíveis. Quando houver tratamento baseado em consentimento, pode solicitar sua revogação e a eliminação correspondente, observadas as hipóteses legais de conservação.',
      'Pendente de confirmação: canal de privacidade e procedimento seguro de atendimento, verificação de identidade e resposta. Não envie senhas, chaves ou tokens em solicitações. A análise deverá considerar quais dados ainda existem e quem os controla; o responsável pela plataforma não pode prometer eliminar cópias salvas por participantes. Permanece o direito de peticionar à autoridade de proteção de dados e aos órgãos competentes.'
    ] },
    { id: 'revisoes', title: 'Revisões e publicação', paragraphs: [
      'Esta versão depende de revisão jurídica e confirmação dos pontos operacionais indicados. A data de revisão identifica a preparação da minuta e não a sua publicação ou vigência. Alterações relevantes deverão ser refletidas na política e comunicadas de forma adequada quando houver uma versão definitiva.',
      'Os Termos de Uso descrevem as condições propostas de participação. Consulte também a LGPD para o texto legal; esta política não constitui certificação de conformidade jurídica.'
    ] },
  ],
};
