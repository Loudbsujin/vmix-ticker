/* vMix Ticker — 조작 화면 */
(function () {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const clone = (o) => JSON.parse(JSON.stringify(o));

  let live = Ticker.defaultState();     // 현재 송출 중인 상태
  let draft = clone(live.messages);     // 편집 중인 문구 목록
  let dirty = false;
  let busy = Promise.resolve();

  /* ---------- 디자인 폼 정의 ---------- */
  const SPEEDS = [[60, '느림'], [120, '보통'], [180, '빠름'], [240, '매우 빠름']];
  const GROUPS = [
    { title: '배치', open: true, fields: [
      { key: 'position', label: '위치', type: 'select', options: [['bottom', '하단'], ['top', '상단']] },
      { key: 'keyColor', label: '배경(키) 색', type: 'select', options: [['#00ff00', '그린 #00FF00'], ['#0000ff', '블루 #0000FF'], ['#ff00ff', '마젠타 #FF00FF'], ['#000000', '블랙 #000000']] },
      { key: 'barHeight', label: '바 높이', type: 'range', min: 48, max: 220, unit: 'px' },
      { key: 'radius', label: '모서리 둥글기', type: 'range', min: 0, max: 60, unit: 'px' },
      { key: 'marginX', label: '좌우 여백', type: 'range', min: 0, max: 240, unit: 'px' },
      { key: 'marginY', label: '상하 여백', type: 'range', min: 0, max: 240, unit: 'px' },
    ] },
    { title: '바 배경 이미지', open: false, fields: [
      { key: 'barImage', label: '피그마·포토샵에서 만든 바 그래픽 (PNG/JPG, 예: 1920×96)', type: 'image', maxW: 3840, maxH: 480, fitButton: true, wide: true },
      { key: 'barImageFit', label: '이미지 맞춤', type: 'select', options: [['cover', '채우기 (넘치는 부분 잘림)'], ['stretch', '늘이기 (비율 무시)'], ['contain', '전체 보이기 (여백 생김)']] },
    ] },
    { title: '왼쪽 표제', open: true, fields: [
      { key: 'labelShow', label: '표제 영역 표시', type: 'check' },
      { key: 'labelShape', label: '모양', type: 'select', options: [['slant', '사선'], ['rect', '사각'], ['pill', '라운드']] },
      { key: 'labelFill', label: '표제 배경색 채우기 (끄면 바 배경 이미지가 보임)', type: 'check', wide: true },
      { key: 'labelText', label: '표제 문구', type: 'text', wide: true },
      { key: 'labelFontSize', label: '표제 글자 크기', type: 'range', min: 16, max: 120, unit: 'px' },
      { key: 'logoHeight', label: '로고 높이', type: 'range', min: 16, max: 180, unit: 'px' },
      { key: 'logo', label: '로고 이미지 (PNG 투명 배경 권장)', type: 'image', maxW: 1200, maxH: 360, wide: true },
    ] },
    { title: '글자', open: true, fields: [
      { key: 'fontFamily', label: '글꼴', type: 'select', options: [['pretendard', 'Pretendard'], ['malgun', '맑은 고딕'], ['custom', '직접 입력 (PC 설치 글꼴)']] },
      { key: 'customFont', label: '글꼴 이름', type: 'text', placeholder: '예: 나눔스퀘어' },
      { key: 'fontSize', label: '글자 크기', type: 'range', min: 16, max: 140, unit: 'px' },
      { key: 'fontWeight', label: '굵기', type: 'select', options: [[400, '보통'], [500, '중간'], [600, '세미볼드'], [700, '볼드'], [800, '엑스트라볼드'], [900, '블랙']] },
      { key: 'separator', label: '구분 기호', type: 'text', placeholder: '•' },
      { key: 'gap', label: '문구 사이 간격', type: 'range', min: 8, max: 300, unit: 'px' },
    ] },
    { title: '색상', open: false, fields: [
      { key: 'barBg', label: '바 배경', type: 'color', preset: true },
      { key: 'textColor', label: '문구', type: 'color', preset: true },
      { key: 'labelBg', label: '표제 배경 · 강조선', type: 'color', preset: true },
      { key: 'labelColor', label: '표제 글자', type: 'color', preset: true },
      { key: 'sepColor', label: '구분 기호', type: 'color', preset: true },
      { key: 'accentLine', label: '강조선 표시', type: 'check' },
    ] },
    { title: '움직임', open: true, fields: [
      { key: 'speed', label: '속도', type: 'speed', min: 20, max: 600, step: 10, wide: true },
      { key: 'edgeFade', label: '양끝 부드럽게 사라지기', type: 'check' },
      { key: 'pixelSnap', label: '픽셀 단위 이동 (선명하게)', type: 'check' },
    ] },
    { title: '긴급 공지 스타일', open: false, fields: [
      { key: 'emergencyLabel', label: '긴급 표제 문구', type: 'text', wide: true },
      { key: 'emergencyBg', label: '바 배경', type: 'color' },
      { key: 'emergencyTextColor', label: '문구', type: 'color' },
      { key: 'emergencyLabelBg', label: '표제 배경', type: 'color' },
      { key: 'emergencyLabelColor', label: '표제 글자', type: 'color' },
    ] },
    { title: '고급: 사용자 CSS', open: false, fields: [
      { key: 'customCss', type: 'css', wide: true },
    ] },
  ];
  const inputs = {}; // key → { el, out, sync() }

  /* ---------- 공통 ---------- */
  let toastTimer;
  function toast(msg, error) {
    const t = $('#toast');
    t.textContent = msg;
    t.className = 'toast' + (error ? ' error' : '');
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, error ? 6000 : 1800);
  }

  // 순서 보장: 발행 요청을 차례로 처리. make()는 차례가 왔을 때 최신 live로 계산된다
  // 성공하면 true. 실패 이유는 여기서 안내한다
  function publish(make) {
    busy = busy.then(async () => {
      const next = typeof make === 'function' ? make() : make;
      try {
        await bus.publish(next);
        if (bus.mode === 'local') onState(next, true);
        return true;
      } catch (err) {
        if (err.code === 'PIN') {
          const pin = prompt('이 서버는 PIN이 설정되어 있습니다. PIN을 입력하세요.');
          if (pin) {
            bus.setPin(pin);
            try {
              await bus.publish(next);
              return true;
            } catch (e2) { /* 아래에서 안내 */ }
          }
          toast('PIN이 맞지 않아 반영하지 못했습니다', true);
        } else if (err instanceof TypeError) {
          // fetch 자체가 실패 = 서버 프로그램이 꺼졌거나 네트워크가 끊김
          toast('서버에 연결할 수 없어 반영하지 못했습니다. 티커 PC의 run.bat 창이 켜져 있는지, 같은 네트워크인지 확인하세요.', true);
        } else {
          toast('반영 실패: ' + err.message, true);
        }
        return false;
      }
    });
    return busy;
  }

  function withLive(patch) {
    return { ...clone(live), ...patch };
  }

  /* ---------- 상태 수신 ---------- */
  function onState(s, own) {
    live = Ticker.normalize(s);
    if (pendingStyle) Object.assign(live.style, pendingStyle);
    if (!dirty) {
      draft = clone(live.messages);
      if (!own || !document.activeElement || !document.activeElement.closest('#list')) renderList();
    }
    renderLive();
    syncStyleForm();
  }

  function renderLive() {
    const vis = $('#toggleVisible');
    vis.textContent = live.visible ? '표시 중' : '숨김';
    vis.className = 'btn ' + (live.visible ? 'onair' : 'offair');
    vis.title = live.visible ? '눌러서 티커 숨기기' : '눌러서 티커 표시';
    $('#liveBadge').textContent = live.visible ? (live.emergency.active ? '긴급 송출' : 'LIVE') : '숨김';
    $('#liveBadge').className = 'badge' + (live.visible ? ' live' : '');

    const em = live.emergency.active;
    $('#emBadge').hidden = !em;
    $('#emOff').disabled = !em;
    $('#emergencyCard').classList.toggle('active', em);
    if (em && document.activeElement !== $('#emText') && !$('#emText').value) $('#emText').value = live.emergency.text;
  }

  /* ---------- 문구 목록 ---------- */
  function setDirty(v) {
    dirty = v;
    $('#dirtyBadge').hidden = !v;
    $('#revert').hidden = !v;
    $('#applyNext').classList.toggle('attention', v);
  }

  function renderList(focusIndex) {
    const list = $('#list');
    list.replaceChildren();
    if (!draft.length) {
      const li = document.createElement('li');
      li.className = 'empty';
      li.textContent = '문구가 없습니다. 아래에서 추가하세요.';
      list.append(li);
    }
    draft.forEach((m, i) => {
      const li = document.createElement('li');
      li.className = 'msg' + (m.on ? '' : ' off');

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = m.on;
      cb.title = '송출에 포함';
      cb.addEventListener('change', () => { m.on = cb.checked; li.classList.toggle('off', !m.on); setDirty(true); });

      const tx = document.createElement('input');
      tx.type = 'text';
      tx.value = m.text;
      tx.placeholder = '공지 문구 입력';
      tx.addEventListener('input', () => { m.text = tx.value; setDirty(true); });
      tx.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && !e.isComposing) {
          e.preventDefault();
          draft.splice(i + 1, 0, { id: Ticker.uid(), text: '', on: true });
          setDirty(true);
          renderList(i + 1);
        }
      });

      const up = iconBtn('↑', '위로', i === 0, () => move(i, -1));
      const down = iconBtn('↓', '아래로', i === draft.length - 1, () => move(i, 1));
      const del = iconBtn('✕', '삭제', false, () => { draft.splice(i, 1); setDirty(true); renderList(); });

      li.append(cb, tx, up, down, del);
      list.append(li);
      if (i === focusIndex) requestAnimationFrame(() => tx.focus());
    });
  }

  function iconBtn(label, title, disabled, fn) {
    const b = document.createElement('button');
    b.className = 'icon-btn';
    b.textContent = label;
    b.title = title;
    b.setAttribute('aria-label', title);
    b.disabled = disabled;
    b.addEventListener('click', fn);
    return b;
  }

  function move(i, d) {
    const [m] = draft.splice(i, 1);
    draft.splice(i + d, 0, m);
    setDirty(true);
    renderList();
  }

  function applyMessages(now) {
    const messages = draft.map((m) => ({ ...m, text: m.text.trim() })).filter((m) => m.text);
    draft = clone(messages);
    setDirty(false);
    renderList();
    publish(() => withLive({
      messages,
      contentRev: live.contentRev + 1,
      restartRev: now ? live.restartRev + 1 : live.restartRev,
    })).then((ok) => {
      if (ok) toast(now ? '즉시 교체했습니다' : '다음 바퀴부터 반영됩니다');
      else setDirty(true); // 작성한 문구를 잃지 않도록 미반영 상태로 되돌린다
    });
  }

  /* ---------- 디자인 폼 ---------- */
  // 슬라이더를 끄는 동안 서버 응답이 와도 값이 되돌아가지 않도록 보낼 변경분을 따로 모은다
  let styleTimer;
  let pendingStyle = null;
  function setStyle(patch) {
    pendingStyle = { ...(pendingStyle || {}), ...patch };
    Object.assign(live.style, patch);
    clearTimeout(styleTimer);
    styleTimer = setTimeout(() => publish(() => {
      const p = pendingStyle;
      pendingStyle = null;
      return withLive({ style: { ...live.style, ...p } });
    }), 60);
    markPreset();
  }

  function buildPresets() {
    const wrap = $('#presets');
    for (const [key, p] of Object.entries(Ticker.PRESETS)) {
      const b = document.createElement('button');
      b.className = 'preset';
      b.dataset.key = key;
      const sw = document.createElement('span');
      sw.className = 'swatch';
      for (const c of [p.barBg, p.labelBg, p.textColor]) {
        const i = document.createElement('i');
        i.style.background = c;
        sw.append(i);
      }
      b.append(sw, document.createTextNode(p.name));
      b.addEventListener('click', () => {
        setStyle({ preset: key, ...Ticker.pickColors(p) });
        syncStyleForm();
      });
      wrap.append(b);
    }
  }

  function markPreset() {
    const st = live.style;
    document.querySelectorAll('.preset').forEach((b) => {
      const p = Ticker.PRESETS[b.dataset.key];
      const match = ['barBg', 'textColor', 'labelBg', 'labelColor', 'sepColor'].every((k) => p[k].toLowerCase() === String(st[k]).toLowerCase());
      b.classList.toggle('on', match);
    });
  }

  function buildStyleForm() {
    const root = $('#styleForm');
    for (const g of GROUPS) {
      const det = document.createElement('details');
      det.className = 'group';
      det.open = g.open;
      const sum = document.createElement('summary');
      sum.textContent = g.title;
      const body = document.createElement('div');
      body.className = 'group-body';
      det.append(sum, body);
      for (const f of g.fields) body.append(buildField(f));
      root.append(det);
    }
  }

  function fieldShell(f) {
    const wrap = document.createElement('div');
    wrap.className = 'field' + (f.wide ? ' wide' : '');
    const lab = document.createElement('div');
    lab.className = 'field-label';
    const name = document.createElement('span');
    name.textContent = f.label;
    const out = document.createElement('output');
    lab.append(name, out);
    wrap.append(lab);
    return { wrap, out };
  }

  function buildField(f) {
    const st = () => live.style;

    if (f.type === 'check') {
      const wrap = document.createElement('label');
      wrap.className = 'field check' + (f.wide ? ' wide' : '');
      const el = document.createElement('input');
      el.type = 'checkbox';
      el.addEventListener('change', () => setStyle({ [f.key]: el.checked }));
      wrap.append(el, document.createTextNode(f.label));
      inputs[f.key] = { el, sync: () => { el.checked = !!st()[f.key]; } };
      return wrap;
    }

    const { wrap, out } = fieldShell(f);

    if (f.type === 'range' || f.type === 'speed') {
      const el = document.createElement('input');
      el.type = 'range';
      el.min = f.min; el.max = f.max; el.step = f.step || 1;
      const label = (v) => f.type === 'speed'
        ? `${v} px/초 · 60fps에서 프레임당 ${+(v / 60).toFixed(2)}px`
        : `${v}${f.unit || ''}`;
      el.addEventListener('input', () => { out.textContent = label(el.value); setStyle({ [f.key]: +el.value }); });
      wrap.append(el);
      let chips;
      if (f.type === 'speed') {
        chips = document.createElement('div');
        chips.className = 'chips';
        for (const [v, name] of SPEEDS) {
          const c = document.createElement('button');
          c.className = 'chip';
          c.textContent = `${name} ${v}`;
          c.dataset.v = v;
          c.addEventListener('click', () => { setStyle({ speed: v }); syncStyleForm(); });
          chips.append(c);
        }
        wrap.append(chips);
      }
      inputs[f.key] = { el, sync: () => {
        el.value = st()[f.key];
        out.textContent = label(st()[f.key]);
        if (chips) chips.querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', +c.dataset.v === st()[f.key]));
      } };
      return wrap;
    }

    if (f.type === 'select') {
      const el = document.createElement('select');
      for (const [v, name] of f.options) {
        const o = document.createElement('option');
        o.value = v;
        o.textContent = name;
        el.append(o);
      }
      el.addEventListener('change', () => {
        const v = typeof f.options[0][0] === 'number' ? +el.value : el.value;
        setStyle({ [f.key]: v });
        if (f.key === 'fontFamily') syncStyleForm();
      });
      wrap.append(el);
      inputs[f.key] = { el, sync: () => {
        el.value = String(st()[f.key]);
        if (f.key === 'fontFamily' && inputs.customFont) inputs.customFont.el.closest('.field').hidden = st().fontFamily !== 'custom';
      } };
      return wrap;
    }

    if (f.type === 'text') {
      const el = document.createElement('input');
      el.type = 'text';
      if (f.placeholder) el.placeholder = f.placeholder;
      el.addEventListener('input', () => setStyle({ [f.key]: el.value }));
      wrap.append(el);
      inputs[f.key] = { el, sync: () => { el.value = st()[f.key]; } };
      return wrap;
    }

    if (f.type === 'color') {
      const el = document.createElement('input');
      el.type = 'color';
      el.addEventListener('input', () => { out.textContent = el.value.toUpperCase(); setStyle({ [f.key]: el.value }); });
      wrap.append(el);
      inputs[f.key] = { el, sync: () => { el.value = st()[f.key]; out.textContent = String(st()[f.key]).toUpperCase(); } };
      return wrap;
    }

    if (f.type === 'image') {
      const row = document.createElement('div');
      row.className = 'logo-row';
      const img = document.createElement('img');
      img.alt = '이미지 미리보기';
      if (f.fitButton) img.className = 'wide';
      const pick = document.createElement('label');
      pick.className = 'btn';
      pick.textContent = '이미지 선택';
      const file = document.createElement('input');
      file.type = 'file';
      file.accept = 'image/png,image/svg+xml,image/webp,image/jpeg';
      file.hidden = true;
      pick.append(file);
      const clear = document.createElement('button');
      clear.className = 'btn ghost';
      clear.textContent = '제거';
      clear.addEventListener('click', () => { setStyle({ [f.key]: '' }); syncStyleForm(); });
      file.addEventListener('change', async () => {
        const f0 = file.files[0];
        file.value = '';
        if (!f0) return;
        try {
          setStyle({ [f.key]: await shrinkImage(f0, f.maxW, f.maxH) });
          syncStyleForm();
        } catch (e) {
          toast('이미지를 읽지 못했습니다', true);
        }
      });
      row.append(img, pick, clear);
      // 바 높이를 이미지 비율에 맞춰 이미지가 잘리거나 늘어나지 않게 한다
      let fit;
      if (f.fitButton) {
        fit = document.createElement('button');
        fit.className = 'btn ghost';
        fit.textContent = '바 높이를 이미지 비율에 맞추기';
        fit.addEventListener('click', () => {
          const barW = Ticker.STAGE_W - 2 * live.style.marginX;
          const h = Math.round(barW * img.naturalHeight / img.naturalWidth);
          if (!h) return;
          setStyle({ barHeight: Math.max(24, Math.min(400, h)) });
          syncStyleForm();
          toast(`바 높이를 ${h}px로 맞췄습니다`);
        });
        row.append(fit);
      }
      wrap.append(row);
      inputs[f.key] = { el: file, sync: () => {
        const has = !!st()[f.key];
        img.hidden = !has;
        clear.hidden = !has;
        if (fit) fit.hidden = !has;
        if (has && img.getAttribute('src') !== st()[f.key]) img.src = st()[f.key];
      } };
      return wrap;
    }

    if (f.type === 'css') {
      const hint = document.createElement('p');
      hint.className = 'hint';
      hint.innerHTML = '송출 화면에 직접 스타일을 덧씌웁니다. 비워 두면 영향 없음. 대상: ' +
        '<code>.bar</code> 바 · <code>.label</code> 표제 · <code>.item</code> 문구 · <code>.sep</code> 구분 기호 · <code>.logo</code> 로고';
      const el = document.createElement('textarea');
      el.className = 'css-box';
      el.rows = 6;
      el.spellcheck = false;
      el.placeholder = '/* 예: 문구에 그림자 */\n.item { text-shadow: 0 2px 6px rgba(0,0,0,.6); }\n\n/* 바에 그라데이션 */\n.bar { background: linear-gradient(90deg, #1e1b4b, #4c1d95); }';
      const actions = document.createElement('div');
      actions.className = 'css-actions';
      const apply = document.createElement('button');
      apply.className = 'btn primary';
      apply.textContent = 'CSS 적용';
      const state = document.createElement('span');
      state.className = 'state';
      const mark = () => {
        const changed = el.value !== st()[f.key];
        state.textContent = changed ? '적용 안 된 변경 있음' : (st()[f.key].trim() ? '적용됨' : '');
        state.classList.toggle('dirty', changed);
      };
      el.addEventListener('input', mark);
      // 입력 도중의 깨진 CSS가 송출되지 않도록 버튼으로만 반영
      apply.addEventListener('click', () => { setStyle({ [f.key]: el.value }); mark(); toast('CSS를 적용했습니다'); });
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); e.stopPropagation(); apply.click(); }
      });
      actions.append(apply, state);
      wrap.querySelector('.field-label').remove();
      wrap.append(hint, el, actions);
      inputs[f.key] = { el, sync: () => {
        if (state.classList.contains('dirty')) { mark(); return; }
        el.value = st()[f.key];
        mark();
      } };
      return wrap;
    }
    return wrap;
  }

  // 이미지는 상태에 data URL로 들어가므로 최대 크기 안으로 줄여 PNG로 저장
  function shrinkImage(file, maxW, maxH) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = reject;
      reader.onload = () => {
        if (file.type === 'image/svg+xml') { resolve(reader.result); return; }
        const img = new Image();
        img.onerror = reject;
        img.onload = () => {
          const k = Math.min(1, maxW / img.naturalWidth, maxH / img.naturalHeight);
          const c = document.createElement('canvas');
          c.width = Math.round(img.naturalWidth * k);
          c.height = Math.round(img.naturalHeight * k);
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          resolve(c.toDataURL('image/png'));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function syncStyleForm() {
    for (const [key, inp] of Object.entries(inputs)) {
      if (document.activeElement === inp.el && inp.el.type !== 'checkbox') continue;
      inp.sync();
    }
    // 글꼴 직접 입력 칸은 '직접 입력'일 때만
    if (inputs.customFont) inputs.customFont.el.closest('.field').hidden = live.style.fontFamily !== 'custom';
    markPreset();
  }

  /* ---------- 내 디자인 ----------
   * 서버 모드: data/designs.json (모든 기기 공유) · 로컬 모드: 이 브라우저 localStorage */
  const DESIGNS_KEY = 'vmixTicker.designs.v1';
  let designs = [];

  async function loadDesigns() {
    if (bus.mode === 'server') {
      try {
        const list = await (await fetch('api/designs', { cache: 'no-store' })).json();
        designs = Array.isArray(list) ? list : [];
      } catch (e) {
        designs = [];
      }
    } else {
      try { designs = JSON.parse(localStorage.getItem(DESIGNS_KEY) || '[]'); } catch (e) { designs = []; }
    }
    renderDesigns();
  }

  async function saveDesigns() {
    if (bus.mode !== 'server') {
      try {
        localStorage.setItem(DESIGNS_KEY, JSON.stringify(designs));
        return true;
      } catch (e) {
        toast('브라우저 저장 공간이 부족합니다. 큰 이미지가 든 디자인을 지우거나 서버 모드(run.bat)를 쓰세요.', true);
        return false;
      }
    }
    const put = () => fetch('api/designs', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', 'x-ticker-pin': encodeURIComponent(bus.pin) },
      body: JSON.stringify(designs),
    });
    try {
      let r = await put();
      if (r.status === 401) {
        const pin = prompt('이 서버는 PIN이 설정되어 있습니다. PIN을 입력하세요.');
        if (!pin) return false;
        bus.setPin(pin);
        r = await put();
      }
      if (!r.ok) throw new Error(r.status === 401 ? 'PIN이 맞지 않습니다' : '서버 오류 ' + r.status);
      return true;
    } catch (e) {
      toast('디자인 저장 실패: ' + e.message, true);
      return false;
    }
  }

  function renderDesigns() {
    const list = $('#designList');
    list.replaceChildren();
    if (!designs.length) {
      const li = document.createElement('li');
      li.className = 'empty';
      li.textContent = '저장한 디자인이 없습니다.';
      list.append(li);
      return;
    }
    designs.forEach((d, i) => {
      const li = document.createElement('li');
      li.className = 'design';
      const sw = document.createElement('span');
      sw.className = 'swatch';
      for (const c of [d.style.barBg, d.style.labelBg, d.style.textColor]) {
        const s = document.createElement('i');
        s.style.background = c;
        sw.append(s);
      }
      if (d.style.barImage) {
        sw.style.background = `center / cover no-repeat url("${d.style.barImage}")`;
        sw.replaceChildren();
      }
      const name = document.createElement('div');
      name.className = 'name';
      name.textContent = d.name;
      const meta = document.createElement('small');
      meta.textContent = new Date(d.savedAt).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' });
      name.append(meta);

      const apply = document.createElement('button');
      apply.className = 'btn primary';
      apply.textContent = '적용';
      apply.addEventListener('click', () => {
        // 예전에 저장한 디자인에 없는 항목은 기본값으로 채운다
        setStyle({ ...Ticker.defaultState().style, ...clone(d.style) });
        syncStyleForm();
        toast(`'${d.name}' 디자인을 적용했습니다`);
      });
      const over = document.createElement('button');
      over.className = 'btn';
      over.textContent = '덮어쓰기';
      over.title = '현재 디자인으로 덮어쓰기';
      over.addEventListener('click', async () => {
        if (!confirm(`'${d.name}'을(를) 현재 디자인으로 덮어쓸까요?`)) return;
        designs[i] = { ...d, style: clone(live.style), savedAt: Date.now() };
        if (await saveDesigns()) { renderDesigns(); toast('덮어썼습니다'); }
      });
      const del = iconBtn('✕', '삭제', false, async () => {
        if (!confirm(`'${d.name}' 디자인을 삭제할까요?`)) return;
        designs.splice(i, 1);
        if (await saveDesigns()) renderDesigns(); else loadDesigns();
      });
      li.append(sw, name, apply, over, del);
      list.append(li);
    });
  }

  async function saveCurrentDesign(name) {
    const existing = designs.findIndex((d) => d.name === name);
    if (existing >= 0 && !confirm(`'${name}' 디자인이 이미 있습니다. 덮어쓸까요?`)) return;
    const entry = { id: existing >= 0 ? designs[existing].id : Ticker.uid(), name, style: clone(live.style), savedAt: Date.now() };
    if (existing >= 0) designs[existing] = entry; else designs.push(entry);
    if (await saveDesigns()) {
      renderDesigns();
      $('#designName').value = '';
      toast(`'${name}' 디자인을 저장했습니다`);
    } else {
      loadDesigns();
    }
  }

  /* ---------- 설정 파일 ---------- */
  function exportConfig() {
    const data = { ...clone(live), messages: dirty ? clone(draft) : clone(live.messages), designs: clone(designs) };
    delete data.seq;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    a.href = URL.createObjectURL(blob);
    a.download = `ticker-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  async function importConfig(file) {
    try {
      const raw = JSON.parse(await file.text());
      const imported = Array.isArray(raw.designs) ? raw.designs.filter((d) => d && d.name && d.style) : [];
      delete raw.designs;
      const s = Ticker.normalize(raw);
      if (!confirm('불러온 설정으로 문구와 디자인을 바꿔 바로 송출합니다.' +
        (imported.length ? `\n저장된 디자인 ${imported.length}개도 '내 디자인'에 추가됩니다 (같은 이름은 교체).` : '') +
        '\n계속할까요?')) return;
      if (imported.length) {
        for (const d of imported) {
          const i = designs.findIndex((x) => x.name === d.name);
          if (i >= 0) designs[i] = d; else designs.push(d);
        }
        if (await saveDesigns()) renderDesigns(); else loadDesigns();
      }
      setDirty(false);
      const ok = await publish(() => ({
        ...s,
        visible: live.visible,
        emergency: live.emergency,
        contentRev: live.contentRev + 1,
        restartRev: live.restartRev + 1,
      }));
      if (!ok) return;
      draft = clone(live.messages);
      renderList();
      toast('설정을 불러왔습니다');
    } catch (e) {
      toast('설정 파일을 읽지 못했습니다', true);
    }
  }

  /* ---------- 연결 표시 ---------- */
  async function onConn(mode, ok) {
    const el = $('#conn');
    if (mode === 'local') {
      el.innerHTML = '<span class="ok">●</span> 로컬 모드 — 이 PC의 브라우저 창끼리만 연동됩니다';
      return;
    }
    if (!ok) {
      el.innerHTML = '<span class="bad">●</span> 서버 연결 끊김 — 재연결 중…';
      return;
    }
    el.innerHTML = '<span class="ok">●</span> LAN 서버 연결됨';
    try {
      const info = await (await fetch('api/info', { cache: 'no-store' })).json();
      if (info.urls && info.urls.length) {
        el.innerHTML += ' · 다른 기기에서 조작: ' + info.urls.map((u) => `<code>${u}</code>`).join(' ');
      }
    } catch (e) { /* 무시 */ }
  }

  /* ---------- 이벤트 ---------- */
  const bus = Ticker.createBus((s) => onState(s, false), onConn);

  $('#addMsg').addEventListener('click', () => {
    draft.push({ id: Ticker.uid(), text: '', on: true });
    setDirty(true);
    renderList(draft.length - 1);
  });
  $('#applyNext').addEventListener('click', () => applyMessages(false));
  $('#applyNow').addEventListener('click', () => applyMessages(true));
  $('#revert').addEventListener('click', () => {
    draft = clone(live.messages);
    setDirty(false);
    renderList();
  });
  $('#toggleVisible').addEventListener('click', () => publish(() => withLive({ visible: !live.visible })));
  $('#openOutput').addEventListener('click', () => {
    const w = window.open('output.html', 'tickerOutput', 'popup=yes,width=1280,height=720');
    if (!w) toast('팝업이 차단되었습니다. output.html을 새 창으로 직접 열어 주세요.', true);
  });

  $('#emOn').addEventListener('click', () => {
    const text = $('#emText').value.trim();
    if (!text) { toast('긴급 공지 문구를 입력하세요', true); $('#emText').focus(); return; }
    publish(() => withLive({ visible: true, emergency: { active: true, text } })).then((ok) => ok && toast('긴급 공지를 송출했습니다'));
  });
  $('#emOff').addEventListener('click', () => {
    publish(() => withLive({ emergency: { active: false, text: live.emergency.text }, restartRev: live.restartRev + 1 }))
      .then((ok) => ok && toast('일반 공지로 돌아갔습니다'));
  });

  $('#saveDesignForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = $('#designName').value.trim();
    if (!name) { toast('디자인 이름을 입력하세요', true); $('#designName').focus(); return; }
    saveCurrentDesign(name);
  });
  $('#exportCfg').addEventListener('click', exportConfig);
  $('#importCfg').addEventListener('change', (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (f) importConfig(f);
  });
  $('#resetStyle').addEventListener('click', () => {
    if (!confirm('디자인 설정을 기본값으로 되돌릴까요? (로고 포함, 문구는 유지)')) return;
    setStyle(Ticker.defaultState().style);
    syncStyleForm();
  });

  addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !e.isComposing) {
      e.preventDefault();
      applyMessages(e.shiftKey);
    }
  });
  addEventListener('beforeunload', (e) => {
    if (dirty) { e.preventDefault(); e.returnValue = ''; }
  });

  buildPresets();
  buildStyleForm();
  renderList();
  renderLive();
  syncStyleForm();
  bus.start().then(loadDesigns);
})();
