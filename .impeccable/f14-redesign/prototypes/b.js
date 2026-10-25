/* Conceito B — Palco colaborativo: a Watch Party é mais uma FONTE do palco (trilho, chips e dock já existentes) */
(() => {
  const { st, I, av, ART, L, prow, counts, time, href, paint } = SR;
  const app = document.getElementById('app');
  const mobile = () => innerWidth <= 900;
  const hasSession = !!st.vid;
  const spec = st.role === 'spec';
  const ctl = !spec;
  const nOthers = 6;
  const cnt = st.av ? counts(st.av) : { ok: 0, total: nOthers, bad: 0 };
  const toWatch = hasSession ? `${spec ? 'view' : 'play'}-${st.vid}` : 'pick';
  const toStreams = hasSession ? (spec ? 'away-spec' : 'away') : 'streams-live';
  const onWatch = st.view === 'watch';
  const pending = onWatch && (st.pick || st.phase === 'offer' || st.phase === 'transfer');
  const vid = st.video;
  const ctlName = ctl ? 'Você' : 'Rafael';

  /* ---------- fontes: trilho (desktop) e barra (toque) ---------- */
  const watchTile = (featured) => {
    const pct = vid ? Math.round(100 * st.pos / vid.duration) : 0;
    if (!hasSession) return `<a class="tile add" href="${href('pick')}"><span class="plus">${I('Plus', 18)}</span><span><b>Assistir vídeo juntos</b><small>MP4 ou WebM · até 20 MiB</small></span></a>`;
    return `<a class="tile wp ${featured ? 'on' : ''}" href="${href(featured ? st.key : toWatch)}" aria-label="Watch Party${featured ? ' (no palco)' : ''}"><div class="th" style="background-image:${vid.art}"><span class="tag lv"><i></i>Vídeo local</span>${featured ? '<span class="tag">No palco</span>' : `<span class="tag">Destacar</span>`}<i class="mprog"><b style="width:${pct}%"></b></i></div>
      <div class="tf"><span class="wpi">${I('Cinema', 14)}</span><b class="ellip">Watch Party</b>${featured ? '' : `<span class="tc">${st.playing ? SR.play(10) : SR.pause(10)} ${time(st.pos)}</span>`}</div>${featured ? '' : `<div class="quiet">${I('VolumeMute', 12)} Sem som fora do palco</div>`}</a>`;
  };
  const screenTile = (name, art, label, featured) => `<a class="tile" href="${href(featured ? st.key : 'streams-live')}"><div class="th" style="background-image:${art}"><span class="tag">${featured ? 'No palco' : 'Destacar'}</span></div><div class="tf">${av(name, 20)}<b class="ellip">${name.split(' ')[0]}</b>${label ? `<span class="tc">${label}</span>` : ''}</div></a>`;

  const peopleList = () => {
    const groups = { a: [], b: [], c: [] };
    Object.entries(st.av).filter(([k]) => !(spec && k === 'marina')).forEach(([k, a]) => groups[SR.GROUPS[a[0]]].push(prow(k, a)));
    const sec = (g) => groups[g].length ? `<h4>${SR.GTITLE[g]} <span>${groups[g].length}</span></h4>${groups[g].join('')}` : '';
    const me = `<div class="prow">${av('Rafael Mota', 36)}<div class="pi"><div class="pn"><span class="ellip">Rafael Mota</span><em>${ctl ? 'você · controla' : 'controla'}</em></div></div></div>${spec ? `<div class="prow">${av('Marina Alves', 36)}<div class="pi"><div class="pn"><span class="ellip">Marina Alves</span><em>você</em></div><div class="ps ok">Assistindo</div></div></div>` : ''}`;
    return `<div class="plist">${me}${sec('a')}${sec('b')}${sec('c')}</div>`;
  };
  const sessionHead = () => `<h3 class="sh">Na sessão <span>${cnt.ok}/${nOthers} prontos</span></h3>`;
  const railFoot = () => ctl ? `<div class="rfoot">${cnt.bad || st.avail === 'invite' ? `<button class="btn secondary small wide">${I('Plus', 15)}Convidar indisponíveis</button>` : ''}<button class="btn danger small wide">Encerrar Watch Party</button></div>` : '';

  const rail = () => {
    let src = '';
    if (onWatch && hasSession) src = `<h3>Fontes na sala (3)</h3>${screenTile('Carlos Lima', ART.code, 'Tela • ao vivo')}${screenTile('Ana Ribeiro', ART.fig, '')}`;
    else if (!onWatch) src = `<h3>${hasSession ? 'Fontes na sala (3)' : 'Outras transmissões (1)'}</h3>${hasSession ? watchTile(false) : ''}${screenTile('Ana Ribeiro', ART.fig, '')}${hasSession ? '' : watchTile(false)}`;
    else src = `<h3>Fontes na sala (2)</h3>${screenTile('Carlos Lima', ART.code, 'Tela • ao vivo')}${screenTile('Ana Ribeiro', ART.fig, '')}`;
    const session = onWatch && hasSession ? `<div class="sess">${sessionHead()}${peopleList()}</div>${railFoot()}` : `<span class="sp"></span><div class="watching"><span>Assistindo</span><b>+3</b></div>`;
    return `<aside class="brail" aria-label="Fontes e participantes"><div class="srcs">${src}</div>${session}</aside>`;
  };
  const sourcesBar = () => {
    const sess = hasSession;
    const wp = `<a class="src wp ${onWatch ? 'on' : ''}" href="${href(sess ? toWatch : 'pick')}" ${onWatch ? 'aria-current="true"' : ''}>${I('Cinema', 16)}<span>Watch Party</span>${sess ? `<i class="pip"></i>${!onWatch ? `<span class="tc">${time(st.pos)}</span>` : ''}` : ''}</a>`;
    const carlos = `<a class="src ${!onWatch ? 'on' : ''}" href="${href(toStreams)}" ${!onWatch ? 'aria-current="true"' : ''}>${av('Carlos Lima', 22)}<span>Carlos</span></a>`;
    const ana = `<a class="src" href="${href(toStreams)}">${av('Ana Ribeiro', 22)}<span>Ana</span></a>`;
    return `<nav class="sbar" aria-label="Fontes do palco">${st.live || onWatch ? carlos + ana : ''}${wp}</nav>`;
  };

  /* ---------- palco ---------- */
  const emptyStreams = () => `<div class="empty"><div class="ei">${I('Screen', 34)}</div><h2>Nenhuma transmissão ativa</h2><p>Quando alguém compartilhar a tela, ela aparecerá aqui automaticamente.</p>
    <div class="ea"><button class="btn">${I('Screen', 17)}Compartilhar tela</button><a class="btn outline" href="${href('pick')}">${I('Cinema', 17)}Assistir vídeo juntos</a><button class="btn secondary">${I('Link', 17)}Copiar convite</button><button class="btn secondary">${I('QrCode', 17)}Mostrar QR Code</button></div></div>`;
  const streamsMain = () => st.live ? `<div class="shot" style="background-image:${ART.code}"></div><div class="chips"><span class="chip">${av('Carlos Lima', 24)}Carlos · Transmitindo<span class="dotg"></span></span><span class="chip plain">${I('Signal', 14)} Tela • Ao vivo</span></div>` : emptyStreams();

  const shield = `<p class="consent">${I('Shield', 16)}<span>Cada pessoa escolhe se deseja receber o vídeo. O arquivo fica apenas temporariamente nesta página.</span></p>`;
  const cardWrap = (inner) => `<div class="empty card">${inner}</div>`;
  const pickCard = () => {
    const busy = st.pick === 'busy', err = st.pick === 'error';
    const file = busy ? { n: 'Uma viagem pela costa.mp4', s: '14,2 MiB' } : { n: 'Farol-ao-entardecer-4k.mp4', s: '34,2 MiB' };
    return cardWrap(`<div class="ei">${I('Cinema', 34)}</div><h2>Seu vídeo. A sala inteira.</h2><p>Escolha um vídeo para assistir juntos.<br>Você dá o play e controla a reprodução da sala.</p>
      ${busy || err ? `<div class="filechip ${err ? 'err' : ''}">${I('Cinema', 18)}<span class="ellip">${file.n}</span><em>${file.s}</em></div>` : ''}
      ${busy ? `<div class="prep" role="status"><div class="bar ind"><i></i></div><span>Verificando e preparando vídeo…</span></div>` : ''}
      ${err ? `<div class="alert" role="alert">${SR.warnI(18)}<span>O arquivo tem 34,2 MiB e o limite é 20 MiB. Escolha outro vídeo MP4 ou WebM.</span></div>` : ''}
      <div class="ea"><button class="btn" ${busy ? 'disabled' : ''}>${I('Cinema', 18)}${busy ? 'Preparando vídeo…' : err ? 'Selecionar outro vídeo' : 'Selecionar vídeo local'}</button><a class="btn subtle" href="${href('streams-live')}">Cancelar</a></div>
      <small class="fmt">MP4 ou WebM · até 20 MiB</small>${shield}
      <div class="crewline"><span class="stack">${['Marina Alves', 'Lucas Pereira', 'Bianca Souza', 'Thiago Nunes'].map(n => av(n, 26)).join('')}<span class="more">+2</span></span><span>Marina, Lucas e mais 4 receberão um convite.</span></div>`);
  };
  const offerCard = () => cardWrap(`<div class="ei">${I('Cinema', 34)}</div><h2>Vamos assistir juntos?</h2><p>Rafael quer assistir a um vídeo com você. Aceite receber o arquivo para acompanhar a sessão.</p>
    <div class="filechip">${I('Cinema', 18)}<span class="ellip">${vid.name}</span><em>${vid.size}</em></div>
    <div class="ea row"><button class="btn">Aceitar vídeo</button><button class="btn subtle">Recusar vídeo</button></div>${shield}`);
  const transferCard = () => cardWrap(`<div class="ei">${I('Cinema', 34)}</div><h2>Transferindo</h2><p>Você poderá assistir assim que o vídeo estiver pronto.</p>
    <div class="filechip">${I('Cinema', 18)}<span class="ellip">${vid.name}</span><em>${vid.size}</em></div>
    <div class="xfer" role="status"><div class="xl"><span>Transferindo</span><b>${st.pct}%</b></div><div class="bar big" role="progressbar" aria-label="Progresso do vídeo" aria-valuenow="${st.pct}"><i style="width:${st.pct}%"></i></div><p class="xs">Depois, conferimos a integridade do arquivo antes de liberar a reprodução.</p></div>
    <p class="consent">${I('Shield', 16)}<span>O vídeo fica temporariamente nesta página.</span></p>`);

  const chipsWatch = () => {
    let label = st.playing ? 'Reproduzindo · sincronizado' : 'Pausado para a sala';
    let warn = false;
    if (st.phase === 'blocked') { label = 'Reprodução bloqueada'; warn = true; }
    if (st.pick || st.phase === 'offer') label = 'Aguardando vídeo';
    if (st.phase === 'transfer') label = `Recebendo vídeo · ${st.pct}%`;
    return `<div class="chips"><span class="chip">${av('Rafael Mota', 24)}${ctl ? 'Você' : 'Rafael'} · Watch Party${ctl ? '<em class="role">Controla</em>' : ''}</span>
      <span class="chip plain ${warn ? 'warn' : ''}">${warn ? SR.warnI(14) : I('Cinema', 14)} Vídeo local · ${label}${!warn && hasSession && !pending ? '<span class="dotg"></span>' : ''}</span></div>`;
  };
  const transport = () => {
    const pct = 100 * st.pos / vid.duration;
    return `<div class="tpill" role="group" aria-label="Controles da Watch Party">
      ${ctl ? `<button class="btn play" aria-label="${st.playing ? 'Pausar para todos' : 'Reproduzir para todos'}">${st.playing ? SR.pause(18) : SR.play(18)}<span>${st.playing ? 'Pausar' : 'Reproduzir'}<span class="fe"> para todos</span></span></button>` : `<span class="role2" title="Somente quem controla pode pausar ou avançar">${SR.lock(14)}<span>Rafael controla</span></span>`}
      <div class="tl"><span class="t" id="tcur">${time(st.pos)}</span><input class="rng" id="seek" type="range" min="0" max="${vid.duration}" value="${st.pos}" aria-label="Posição do vídeo" ${spec ? 'disabled' : ''} style="--v:${pct}%"><span class="t dim">${time(vid.duration)}</span></div>
      <div class="aud" role="group" aria-label="Áudio neste dispositivo"><button class="iconbtn" aria-label="Silenciar vídeo">${I('Volume', 20)}</button><label><span class="sr">Volume do vídeo</span><input class="rng vol" type="range" min="0" max="1" step=".05" value=".8" style="--v:80%"></label><small>Só você</small></div></div>`;
  };
  const veil = () => st.phase === 'blocked' ? `<div class="veil"><button class="bigplay" aria-label="Ativar reprodução neste dispositivo">${SR.play(30)}</button><p>O navegador precisa da sua permissão para reproduzir aqui.</p><button class="btn">Ativar reprodução neste dispositivo</button></div>` : '';
  const viewTools = () => `<div class="vtools"><button class="iconbtn glass" aria-label="Modo Cinema" title="Modo Cinema">${I('Cinema', 20)}</button><button class="iconbtn glass" aria-label="Tela cheia" title="Tela cheia">${I('Maximize', 20)}</button></div>`;
  const crewBtn = () => `<button class="crewbtn" aria-label="Participantes da sessão" onclick="location.search='${href(st.key, st.panel ? '&panel=0' : '&panel=1')}'"><span>${cnt.ok}/${nOthers} prontos</span>${cnt.bad ? '<i class="warnpip"></i>' : ''}${I('ChevronRight', 14)}</button>`;
  const sheet = () => `<aside class="sheet" aria-label="Participantes da Watch Party"><header><h3>Na sessão <span>${cnt.ok}/${nOthers} prontos</span></h3><button class="iconbtn" aria-label="Fechar" onclick="location.search='${href(st.key, '&panel=0')}'">${I('Close', 18)}</button></header><div class="sb">${peopleList()}${railFoot()}</div></aside>`;

  const watchMain = () => {
    if (st.pick) return `${chipsWatch()}${pickCard()}`;
    if (st.phase === 'offer') return `${chipsWatch()}${offerCard()}`;
    if (st.phase === 'transfer') return `${chipsWatch()}${transferCard()}`;
    const vertical = st.vid === 'v';
    return `${chipsWatch()}<div class="bvid" style="--ar:${vertical ? .5625 : 1.7778}"><div class="bscreen" style="background-image:${vid.art}">${veil()}</div></div>${mobile() ? '' : viewTools()}`;
  };

  const render = () => {
    const m = mobile();
    const showRail = !m && (st.live || hasSession || (!onWatch && st.live)) && !st.full;
    const body = onWatch ? watchMain() : streamsMain();
    const sheetOpen = m && onWatch && hasSession && !pending && st.panel;
    app.innerHTML = `<div class="app b">${st.full ? '' : SR.header()}<main class="stage ${st.chat ? 'chatting' : ''} ${st.full ? 'full' : ''}">
      <div class="bstage ${showRail ? 'withrail' : ''}">${m && !st.full ? sourcesBar() : ''}<div class="bmain ${m ? 'm' : ''} ${pending ? 'pending' : ''}">${body}${m && onWatch && hasSession && !pending ? crewBtn() : ''}${!onWatch && st.session ? mobileAway() : ''}</div>${showRail ? rail() : ''}</div>
      ${onWatch && hasSession && !pending ? transport() : ''}${sheetOpen ? sheet() : ''}${st.chat ? SR.chatPanel() : ''}${st.full ? '' : SR.dock()}</main></div>`;
    document.title = `B · ${SR.S[st.key].label}`;
    SR.clock((t) => { const s = document.getElementById('seek'); if (!s) return; s.value = t; paint(s, 100 * t / vid.duration); const c = document.getElementById('tcur'); if (c) c.textContent = time(t); });
    document.querySelectorAll('.rng').forEach(r => r.addEventListener('input', () => paint(r, 100 * (r.value - r.min) / (r.max - r.min))));
  };
  const mobileAway = () => '';
  render(); let was = mobile(); addEventListener('resize', () => { if (was !== mobile()) { was = mobile(); render(); } });
})();
