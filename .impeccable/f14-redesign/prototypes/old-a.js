/* Conceito A — Sala de cinema */
(() => {
  const { st, I, av, ART, L, prow, counts, time, href, paint } = SR;
  const app = document.getElementById('app');
  const mobile = () => innerWidth <= 900;
  const hasSession = !!st.vid;
  const spec = st.role === 'spec';
  const ctl = !spec;
  const controllerName = ctl ? 'Você' : 'Rafael';
  const nOthers = 6;
  const toWatch = hasSession ? `${spec ? 'view' : 'play'}-${st.vid}` : 'pick';
  const toStreams = hasSession ? (spec ? 'away-spec' : 'away') : 'streams-live';
  const cnt = st.av ? counts(st.av) : { ok: 0, total: nOthers, bad: 0 };

  /* ---------- seletor de modo (idêntico nas duas telas) ---------- */
  const switcher = () => {
    const w = st.view === 'watch';
    const sessionTag = hasSession ? `<span class="pip" aria-hidden="true"></span>` : '';
    const tc = hasSession && !w ? `<span class="tc">${time(st.pos)}</span>` : '';
    return `<nav class="sw" aria-label="Modos do palco">
      <a class="seg" href="${href(toStreams)}" ${!w ? 'aria-current="page"' : ''}>${I('Screen', 16)}<span>Transmissões</span><span class="n">${st.live || st.view === 'watch' ? 2 : 0}</span></a>
      <a class="seg" href="${href(toWatch)}" ${w ? 'aria-current="page"' : ''}>${I('Cinema', 16)}<span>Watch Party</span>${sessionTag}${tc}</a></nav>`;
  };

  /* ---------- Transmissões ---------- */
  const emptyStreams = () => `<div class="empty"><div class="ei">${I('Screen', 34)}</div><h2>Nenhuma transmissão ativa</h2>
    <p>Quando alguém compartilhar a tela, ela aparecerá aqui automaticamente.</p>
    <div class="ea"><button class="btn">${I('Screen', 17)}Compartilhar tela</button><button class="btn secondary">${I('Link', 17)}Copiar convite</button><button class="btn secondary">${I('QrCode', 17)}Mostrar QR Code</button></div>
    <a class="alt" href="${href('pick')}">${I('Cinema', 16)}<span>Ou assistir a um vídeo juntos</span>${I('ChevronRight', 15)}</a></div>`;
  const rail = () => `<aside class="rail" aria-label="Outras transmissões"><h3>Outras transmissões (1)</h3>
    <div class="tile"><div class="th" style="background-image:${ART.fig}"><span class="tag">Destacar</span></div><div class="tf">${av('Ana Ribeiro', 20)}<b>Ana</b></div></div><span class="sp"></span>
    <div class="watching"><span>Assistindo</span><b>+3</b></div></aside>`;
  const mini = () => {
    const v = st.video; const pct = Math.round(100 * st.pos / v.duration);
    return `<aside class="mini" aria-label="Watch Party em andamento">
      <a class="mthumb" href="${href(toWatch)}" aria-label="Abrir a Watch Party" style="background-image:${v.art}"><span class="quiet">${I('VolumeMute', 13)}Sem som aqui</span><i class="mprog"><b style="width:${pct}%"></b></i></a>
      <div class="mi"><div class="mt"><b class="ellip">${v.name.replace('.mp4', '')}</b><small class="ellip">${spec ? 'Rafael controla' : 'Você controla'} · ${cnt.ok} assistindo</small></div>
      ${ctl ? `<button class="iconbtn mplay" aria-label="${st.playing ? 'Pausar para todos' : 'Reproduzir para todos'}">${st.playing ? SR.pause(18) : SR.play(18)}</button>` : ''}
      <a class="btn small" href="${href(toWatch)}">Abrir</a></div></aside>`;
  };
  const streams = () => `<div class="streams ${st.live ? 'has' : ''}">
    <div class="smain">${st.live ? `<div class="shot" style="background-image:${ART.code}"></div>
      <div class="chips"><span class="chip">${av('Carlos Lima', 24)}Carlos · Transmitindo<span class="dotg"></span></span><span class="chip plain">${I('Signal', 14)} Tela • Ao vivo</span></div>` : emptyStreams()}
      ${st.session ? mini() : ''}</div>${st.live && !mobile() ? rail() : ''}
    ${st.live && mobile() ? `<div class="mstrip ${st.session ? 'up' : ''}"><div class="tile"><div class="th" style="background-image:${ART.fig}"><span class="tag">Destacar</span></div><div class="tf">${av('Ana Ribeiro', 20)}<b>Ana</b></div></div></div>` : ''}</div>`;

  /* ---------- Watch Party ---------- */
  const shield = `<p class="consent">${I('Shield', 16)}<span>Cada pessoa escolhe se deseja receber o vídeo. O arquivo fica apenas temporariamente nesta página.</span></p>`;
  const crewLine = () => `<div class="crewline"><span class="stack">${['Marina Alves', 'Lucas Pereira', 'Bianca Souza', 'Thiago Nunes'].map(n => av(n, 28)).join('')}<span class="more">+2</span></span><span>Marina, Lucas e mais 4 receberão um convite quando você escolher o vídeo.</span></div>`;
  const pick = () => {
    const busy = st.pick === 'busy', err = st.pick === 'error';
    const file = busy ? { n: 'Uma viagem pela costa.mp4', s: '14,2 MiB' } : { n: 'Farol-ao-entardecer-4k.mp4', s: '34,2 MiB' };
    return `<div class="stagecard"><section class="screenbox" aria-label="Watch Party"><div class="ei">${I('Cinema', 34)}</div>
      <h2>Seu vídeo. A sala inteira.</h2><p class="lede">Escolha um vídeo para assistir juntos.<br>Você dá o play e controla a reprodução da sala.</p>
      ${busy || err ? `<div class="filechip ${err ? 'err' : ''}">${I('Cinema', 18)}<span class="ellip">${file.n}</span><em>${file.s}</em></div>` : ''}
      ${busy ? `<div class="prep" role="status"><div class="bar ind"><i></i></div><span>Verificando e preparando vídeo…</span></div>` : ''}
      ${err ? `<div class="alert" role="alert">${SR.warnI(18)}<span>O arquivo tem 34,2 MiB e o limite é 20 MiB. Escolha outro vídeo MP4 ou WebM.</span></div>` : ''}
      <button class="btn big" ${busy ? 'disabled' : ''}>${I('Cinema', 19)}${busy ? 'Preparando vídeo…' : err ? 'Selecionar outro vídeo' : 'Selecionar vídeo local'}</button>
      <small class="fmt">MP4 ou WebM · até 20 MiB</small></section>${shield}${crewLine()}</div>`;
  };
  const offer = () => `<div class="stagecard"><section class="screenbox" aria-label="Convite da Watch Party"><div class="ei">${I('Cinema', 34)}</div>
    <h2>Vamos assistir juntos?</h2><p class="lede">Rafael quer assistir a um vídeo com você. Aceite receber o arquivo para acompanhar a sessão.</p>
    <div class="filechip">${I('Cinema', 18)}<span class="ellip">${st.video.name}</span><em>${st.video.size}</em></div>
    <div class="acts"><button class="btn big">Aceitar vídeo</button><button class="btn big subtle">Recusar vídeo</button></div></section>${shield}</div>`;
  const transfer = () => `<div class="stagecard"><section class="screenbox" aria-label="Recebendo o vídeo"><div class="ei">${I('Cinema', 34)}</div>
    <h2>Transferindo</h2><p class="lede">Você poderá assistir assim que o vídeo estiver pronto.</p>
    <div class="filechip">${I('Cinema', 18)}<span class="ellip">${st.video.name}</span><em>${st.video.size}</em></div>
    <div class="xfer" role="status"><div class="xl"><span>Transferindo</span><b>${st.pct}%</b></div><div class="bar big" role="progressbar" aria-label="Progresso do vídeo" aria-valuenow="${st.pct}"><i style="width:${st.pct}%"></i></div>
    <ol class="trail"><li class="done">Convite aceito</li><li class="on">Transferindo</li><li>Verificando integridade</li><li>Pronto para assistir</li></ol></div></section>
    <p class="consent">${I('Shield', 16)}<span>O vídeo fica temporariamente nesta página. Se algo falhar, peça a Rafael um novo convite.</span></p></div>`;

  const ctrl = () => {
    const v = st.video; const pct = 100 * st.pos / v.duration;
    const status = st.phase === 'blocked' ? 'Reprodução bloqueada pelo navegador' : st.playing ? 'Reproduzindo · sincronização aproximada' : 'Pausado para a sala';
    return `<div class="ctrl"><div class="tl"><span class="t" id="tcur">${time(st.pos)}</span><input class="rng" id="seek" type="range" min="0" max="${v.duration}" value="${st.pos}" aria-label="Posição do vídeo" ${spec ? 'disabled aria-describedby="seekhint"' : ''} style="--v:${pct}%"><span class="t dim">${time(v.duration)}</span></div>
      <div class="row">${ctl ? `<button class="btn play" aria-label="${st.playing ? 'Pausar para todos' : 'Reproduzir para todos'}">${st.playing ? SR.pause(18) : SR.play(18)}<span>${st.playing ? 'Pausar' : 'Reproduzir'}<span class="fe"> para todos</span></span></button>`
      : `<span class="role" id="seekhint">${SR.lock(14)}<span>Rafael controla</span></span>`}
        <span class="status" role="status">${status}</span>
        <div class="aud" role="group" aria-label="Áudio neste dispositivo"><button class="iconbtn" aria-label="Silenciar vídeo">${I('Volume', 20)}</button><label><span class="sr">Volume do vídeo</span><input class="rng vol" type="range" min="0" max="1" step=".05" value=".8" style="--v:80%"></label><small>Só você</small></div></div></div>`;
  };
  const veil = () => st.phase === 'blocked' ? `<div class="veil"><button class="bigplay" aria-label="Ativar reprodução neste dispositivo">${SR.play(30)}</button><p>O navegador precisa da sua permissão para reproduzir aqui.</p><button class="btn">Ativar reprodução neste dispositivo</button></div>` : '';
  const crew = () => `<button class="crew" aria-label="Participantes da sessão: ${cnt.ok} de ${nOthers} prontos" aria-expanded="${!!st.panel}" onclick="location.search='${href(st.key, st.panel ? '&panel=0' : '&panel=1')}'"><span class="stack">${['Marina Alves', 'Lucas Pereira', 'Bianca Souza'].map(n => av(n, 26)).join('')}</span><span>${cnt.ok}/${nOthers}<span class="w"> prontos</span></span>${cnt.bad ? `<i class="warnpip" title="${cnt.bad} indisponíveis"></i>` : ''}${I('ChevronDown', 14)}</button>`;

  const selfRows = () => {
    const row = (name, sub, you) => `<div class="prow">${av(name, 36)}<div class="pi"><div class="pn"><span class="ellip">${name}</span>${you ? '<em>você</em>' : ''}</div><div class="ps">${sub}</div></div></div>`;
    return `<div class="me">${ctl ? row('Rafael Mota', 'Controla a reprodução', true) : row('Rafael Mota', 'Controla a reprodução', false) + row('Marina Alves', 'Assistindo', true)}</div>`;
  };
  const people = (withEnd = true) => {
    const groups = { a: [], b: [], c: [] };
    Object.entries(st.av).filter(([k]) => !(spec && k === 'marina')).forEach(([k, a]) => groups[SR.GROUPS[a[0]]].push(prow(k, a)));
    const sec = (g) => groups[g].length ? `<section class="grp"><h4>${SR.GTITLE[g]} <span>${groups[g].length}</span></h4>${groups[g].join('')}${g === 'c' && ctl ? `<button class="btn secondary small wide">${I('Plus', 15)}Convidar indisponíveis</button>` : ''}</section>` : '';
    return `<div class="people">${selfRows()}${sec('a')}${sec('b')}${sec('c')}${ctl && withEnd ? `<div class="endzone"><button class="btn danger wide">Encerrar Watch Party</button></div>` : ''}</div>`;
  };
  const drawer = () => `<aside class="drawer" aria-label="Participantes da Watch Party"><header><h3>Na sessão <span>${cnt.ok}/${nOthers} prontos</span></h3><button class="iconbtn" aria-label="Fechar" onclick="location.search='${href(st.key, '&panel=0')}'">${I('Close', 18)}</button></header><div class="dbody">${people()}</div></aside>`;

  const console_ = () => `<aside class="console" aria-label="Sessão"><div class="cc">${ctrl()}</div><div class="cp"><h3>Na sessão <span>${cnt.ok}/${nOthers} prontos</span></h3>${people(false)}</div>${ctl ? `<div class="endzone pinned"><button class="btn danger wide">Encerrar Watch Party</button></div>` : ''}</aside>`;

  const topbar = (full) => `<div class="topbar"><div class="l">${full ? `<div class="ttl"><b class="ellip">${st.video.name}</b><small>${ctl ? 'Você controla a reprodução' : 'Rafael controla a reprodução'}</small></div>` : hasSession ? `<div class="ttl"><b class="ellip">${st.video.name}</b><small>${ctl ? 'Você controla a reprodução' : 'Rafael controla a reprodução'}</small></div>` : ''}</div>
    ${full ? '' : switcher()}<div class="r">${full ? `<button class="btn small glass">${I('Minimize', 16)}Sair da tela cheia</button>` : `<button class="btn small glass d-only">${I('Cinema', 16)}Modo Cinema</button><button class="btn small glass d-only">${I('Maximize', 16)}Tela cheia</button><button class="iconbtn glass m-only" aria-label="Modo Cinema">${I('Cinema', 18)}</button><button class="iconbtn glass m-only" aria-label="Tela cheia">${I('Maximize', 18)}</button>`}</div></div>`;

  const watchBody = () => {
    const full = st.full;
    if (!hasSession && !st.phase) return `<div class="watch"><div class="amb idle"></div>${topbar()}<div class="center">${pick()}</div></div>`;
    if (st.phase === 'offer' || st.phase === 'transfer') return `<div class="watch"><div class="amb idle"></div>${topbar()}<div class="center">${st.phase === 'offer' ? offer() : transfer()}</div>${st.panel ? drawer() : ''}</div>`;
    const v = st.video; const vertical = st.vid === 'v'; const side = vertical && !mobile();
    const ar = vertical ? 0.5625 : 1.7778;
    const stageUi = `<div class="vscreen" style="background-image:${v.art}">${veil()}${crew()}</div>`;
    return `<div class="watch ${full ? 'full' : ''} ${vertical ? 'vert' : ''}"><div class="amb" style="background-image:${v.art}"></div>${topbar(full)}
      <div class="theater ${side ? 'side' : ''}" style="--ar:${ar}">
        <div class="player ${st.phase === 'blocked' ? 'blocked' : ''}">${stageUi}${side ? '' : ctrl()}</div>${side ? console_() : ''}</div>
      ${!side && st.panel ? drawer() : ''}${side && !mobile() ? '' : ''}</div>`;
  };

  const render = () => {
    const showHdr = !st.full;
    app.innerHTML = `<div class="app a">${showHdr ? SR.header() : ''}<main class="stage ${st.chat ? 'chatting' : ''}">${st.view === 'watch' ? watchBody() : `${streams()}${switcherOverlay()}`}${st.chat ? SR.chatPanel() : ''}${st.full ? '' : SR.dock()}</main></div>`;
    document.title = `A · ${SR.S[st.key].label}`;
    SR.clock((t) => { paint(document.getElementById('seek'), 100 * t / st.video.duration); const s = document.getElementById('seek'); if (s) s.value = t; const c = document.getElementById('tcur'); if (c) c.textContent = time(t); });
    document.querySelectorAll('.rng').forEach(r => r.addEventListener('input', () => { const p = 100 * (r.value - r.min) / (r.max - r.min); paint(r, p); }));
  };
  const switcherOverlay = () => `<div class="swhost">${switcher()}</div>`;
  render(); let was = mobile(); addEventListener('resize', () => { if (was !== mobile()) { was = mobile(); render(); } });
})();
