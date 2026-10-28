/* vMix Ticker — 송출 화면/조작 화면 공용 모듈 (상태 기본값, 동기화 버스, 티커 렌더러) */
(function (global) {
  'use strict';

  const STAGE_W = 1920;
  const STAGE_H = 1080;
  const LS_KEY = 'vmixTicker.state.v1';
  const CHANNEL = 'vmix-ticker';

  const PRESETS = {
    midnight: { name: '미드나잇', barBg: '#111827', textColor: '#ffffff', labelBg: '#6366f1', labelColor: '#ffffff', sepColor: '#818cf8' },
    white:    { name: '클린 화이트', barBg: '#ffffff', textColor: '#111827', labelBg: '#111827', labelColor: '#ffffff', sepColor: '#9ca3af' },
    news:     { name: '뉴스 레드', barBg: '#0b1220', textColor: '#ffffff', labelBg: '#dc2626', labelColor: '#ffffff', sepColor: '#ef4444' },
    navy:     { name: '네이비 골드', barBg: '#0f2347', textColor: '#ffffff', labelBg: '#c9a227', labelColor: '#0f2347', sepColor: '#c9a227' },
    mint:     { name: '포레스트 민트', barBg: '#06302c', textColor: '#ecfdf5', labelBg: '#10b981', labelColor: '#04221f', sepColor: '#34d399' },
    mono:     { name: '모노 블랙', barBg: '#000000', textColor: '#ffffff', labelBg: '#ffffff', labelColor: '#000000', sepColor: '#6b7280' },
  };

  function uid() {
    return Math.random().toString(36).slice(2, 10);
  }

  function defaultState() {
    return {
      v: 1,
      seq: 0,
      visible: true,
      contentRev: 0,
      restartRev: 0,
      messages: [
        { id: uid(), text: '행사에 오신 여러분을 환영합니다', on: true },
        { id: uid(), text: '다음 프로그램은 14:00에 시작합니다', on: true },
        { id: uid(), text: '체험 접수는 1층 안내데스크에서 가능합니다', on: true },
      ],
      emergency: { active: false, text: '' },
      floats: { visible: true, items: [] },
      style: {
        preset: 'midnight',
        ...pickColors(PRESETS.midnight),
        position: 'bottom',
        barHeight: 96,
        marginX: 0,
        marginY: 0,
        radius: 0,
        keyColor: '#00ff00',
        barImage: '',
        barImageFit: 'cover',
        labelShow: true,
        labelFill: true,
        labelText: '행사 안내',
        labelShape: 'slant',
        labelFontSize: 38,
        logo: '',
        logoHeight: 56,
        fontFamily: 'pretendard',
        customFont: '',
        fontSize: 44,
        fontWeight: 600,
        separator: '•',
        gap: 64,
        accentLine: true,
        speed: 120,
        edgeFade: true,
        pixelSnap: true,
        emergencyLabel: '긴급 공지',
        emergencyBg: '#b91c1c',
        emergencyTextColor: '#ffffff',
        emergencyLabelBg: '#ffffff',
        emergencyLabelColor: '#b91c1c',
        customCss: '',
        floatMotion: 'rise',
        floatArea: 'full',
        floatMax: 5,
        floatInterval: 2.5,
        floatSpeed: 60,
        floatLife: 8,
        floatFontSize: 40,
        floatWeight: 700,
        floatMaxWidth: 640,
        floatShape: 'bubble',
        floatColorMode: 'single',
        floatBg: '#ffffff',
        floatColor: '#111827',
      },
    };
  }

  function pickColors(p) {
    return { barBg: p.barBg, textColor: p.textColor, labelBg: p.labelBg, labelColor: p.labelColor, sepColor: p.sepColor };
  }

  function normalize(s) {
    const d = defaultState();
    if (!s || typeof s !== 'object') return d;
    return {
      ...d,
      ...s,
      messages: Array.isArray(s.messages)
        ? s.messages
            .filter((m) => m && typeof m.text === 'string')
            .map((m) => ({ id: m.id || uid(), text: m.text, on: m.on !== false }))
        : d.messages,
      emergency: { ...d.emergency, ...(s.emergency || {}) },
      floats: {
        visible: s.floats ? !!s.floats.visible : d.floats.visible,
        items: s.floats && Array.isArray(s.floats.items)
          ? s.floats.items
              .filter((m) => m && typeof m.text === 'string')
              .map((m) => ({ id: m.id || uid(), text: m.text, on: m.on !== false }))
          : [],
      },
      style: { ...d.style, ...(s.style || {}) },
    };
  }

  function fontStack(st) {
    const base = "'Pretendard Variable', Pretendard, 'Malgun Gothic', '맑은 고딕', sans-serif";
    if (st.fontFamily === 'malgun') return "'Malgun Gothic', '맑은 고딕', sans-serif";
    if (st.fontFamily === 'custom' && st.customFont.trim()) {
      return `"${st.customFont.replace(/["\\;{}]/g, '').trim()}", ${base}`;
    }
    return base;
  }

  /* ---------- 동기화 버스 ----------
   * http(s)로 server.js에 접속하면 서버 모드(SSE + POST, 다른 기기에서도 조작 가능),
   * 파일을 직접 열면 로컬 모드(같은 PC 브라우저 창끼리 BroadcastChannel/localStorage). */
  function createBus(onState, onStatus) {
    const bus = { mode: 'local', lastSeq: -1, pin: '' };
    const status = (ok) => onStatus && onStatus(bus.mode, ok);

    try { bus.pin = localStorage.getItem('vmixTicker.pin') || ''; } catch (e) { /* 저장소 없음 */ }

    function deliver(s) {
      if (!s || typeof s.seq !== 'number' || s.seq <= bus.lastSeq) return;
      bus.lastSeq = s.seq;
      onState(s);
    }

    function openEvents() {
      const es = new EventSource('api/events');
      es.onopen = () => status(true);
      es.onerror = () => status(false);
      es.onmessage = (e) => {
        try { deliver(JSON.parse(e.data)); } catch (err) { /* 무시 */ }
      };
    }

    bus.start = async function () {
      if (location.protocol.startsWith('http')) {
        try {
          const r = await fetch('api/state', { cache: 'no-store' });
          if (r.ok) {
            bus.mode = 'server';
            deliver(await r.json());
            openEvents();
            return bus;
          }
        } catch (e) { /* 서버 없음 → 로컬 모드 */ }
      }
      bus.mode = 'local';
      try {
        const raw = localStorage.getItem(LS_KEY);
        if (raw) deliver(JSON.parse(raw));
      } catch (e) { /* 무시 */ }
      try {
        bus.channel = new BroadcastChannel(CHANNEL);
        bus.channel.onmessage = (e) => deliver(e.data);
      } catch (e) { /* 미지원 → storage 이벤트로 대체 */ }
      addEventListener('storage', (e) => {
        if (e.key !== LS_KEY || !e.newValue) return;
        try { deliver(JSON.parse(e.newValue)); } catch (err) { /* 무시 */ }
      });
      status(true);
      return bus;
    };

    bus.publish = async function (state) {
      if (bus.mode === 'server') {
        const r = await fetch('api/state', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-ticker-pin': encodeURIComponent(bus.pin) },
          body: JSON.stringify(state),
        });
        if (r.status === 401) {
          const err = new Error('PIN이 필요합니다');
          err.code = 'PIN';
          throw err;
        }
        if (!r.ok) throw new Error('서버 오류 ' + r.status);
        const saved = await r.json();
        deliver(saved);
        return saved;
      }
      const s = { ...state, seq: Math.max(Date.now(), bus.lastSeq + 1) };
      bus.lastSeq = s.seq;
      try { localStorage.setItem(LS_KEY, JSON.stringify(s)); } catch (e) { /* 용량 초과 등 */ }
      try { bus.channel && bus.channel.postMessage(s); } catch (e) { /* 무시 */ }
      return s;
    };

    bus.setPin = function (pin) {
      bus.pin = pin;
      try { localStorage.setItem('vmixTicker.pin', pin); } catch (e) { /* 무시 */ }
    };

    return bus;
  }

  /* ---------- 렌더러 ----------
   * 컨베이어 방식: 문구 묶음(세그먼트)을 오른쪽 끝에 필요할 때마다 이어 붙이고
   * 왼쪽으로 완전히 빠져나간 세그먼트는 제거한다. 새 세그먼트는 붙는 순간의 문구를
   * 쓰므로 '다음 바퀴부터 반영'이 흐름 끊김 없이 자연스럽게 된다. */
  const LAYOUT_KEYS = [
    'barHeight', 'marginX', 'fontSize', 'fontWeight', 'fontFamily', 'customFont', 'gap',
    'labelShow', 'labelText', 'labelShape', 'labelFontSize', 'logo', 'logoHeight', 'emergencyLabel', 'customCss',
  ];
  const IMAGE_FIT = { cover: 'cover', contain: 'contain', stretch: '100% 100%' };

  class Renderer {
    constructor(stage) {
      this.stage = stage;
      stage.innerHTML =
        '<div class="bar hidden"><div class="label"><span class="dot"></span><img class="logo" alt="">' +
        '<span class="label-text"></span></div><div class="viewport"><div class="track"></div></div></div>';
      this.bar = stage.querySelector('.bar');
      this.label = stage.querySelector('.label');
      this.logo = stage.querySelector('.logo');
      this.labelText = stage.querySelector('.label-text');
      this.viewport = stage.querySelector('.viewport');
      this.track = stage.querySelector('.track');
      this.scale = 1;
      this.state = null;
      this.segs = [];
      this.offset = 0;
      this.frameMs = 1000 / 60;
      this._samples = [];
      this._last = 0;
      this._loop = this._loop.bind(this);
      requestAnimationFrame(this._loop);
    }

    setScale(scale) {
      this.scale = scale;
    }

    setState(s) {
      const prev = this.state;
      this.state = s;
      const emergency = s.emergency.active;
      this._applyStyle(s.style, emergency);
      this.bar.classList.toggle('hidden', !s.visible);

      const emergencyChanged =
        !prev ||
        prev.emergency.active !== emergency ||
        (emergency && prev.emergency.text !== s.emergency.text);
      if (!prev || prev.restartRev !== s.restartRev || emergencyChanged) {
        this.restart();
      } else {
        if (prev.style.separator !== s.style.separator) {
          this.track.querySelectorAll('.sep').forEach((el) => { el.textContent = s.style.separator; });
        }
        if (LAYOUT_KEYS.some((k) => prev.style[k] !== s.style[k]) || prev.style.separator !== s.style.separator) {
          this.remeasure();
        }
      }
    }

    _applyStyle(st, emergency) {
      const v = (k, val) => this.stage.style.setProperty(k, val);
      v('--key', st.keyColor);
      v('--bar-h', st.barHeight + 'px');
      v('--mx', st.marginX + 'px');
      v('--my', st.marginY + 'px');
      v('--radius', st.radius + 'px');
      v('--fs', st.fontSize + 'px');
      v('--fw', String(st.fontWeight));
      v('--gap', st.gap + 'px');
      v('--label-fs', st.labelFontSize + 'px');
      v('--logo-h', st.logoHeight + 'px');
      v('--font', fontStack(st));
      v('--bar-bg', emergency ? st.emergencyBg : st.barBg);
      v('--text', emergency ? st.emergencyTextColor : st.textColor);
      v('--label-bg', emergency ? st.emergencyLabelBg : st.labelBg);
      v('--label-color', emergency ? st.emergencyLabelColor : st.labelColor);
      v('--sep-color', emergency ? st.emergencyTextColor : st.sepColor);

      // 큰 data URL을 매번 다시 넣지 않도록 바뀔 때만 설정
      const barImg = !emergency && st.barImage ? `url("${st.barImage}")` : 'none';
      if (barImg !== this._barImg) { v('--bar-img', barImg); this._barImg = barImg; }
      v('--bar-img-size', IMAGE_FIT[st.barImageFit] || 'cover');

      if (!this._css) {
        this._css = document.createElement('style');
        document.head.appendChild(this._css);
      }
      if (this._css.textContent !== st.customCss) this._css.textContent = st.customCss;

      this.stage.classList.toggle('emergency', emergency);
      this.bar.classList.toggle('top', st.position === 'top');
      this.bar.classList.toggle('accent', !!st.accentLine);
      this.viewport.classList.toggle('fade', !!st.edgeFade);
      this.label.className = 'label shape-' + (st.labelShape || 'rect');
      this.label.classList.toggle('nofill', !emergency && !st.labelFill);

      const showLogo = !emergency && !!st.logo;
      const text = emergency ? st.emergencyLabel : st.labelText;
      const showLabel = emergency || (st.labelShow && (text.trim() || showLogo));
      this.label.hidden = !showLabel;
      this.logo.hidden = !showLogo;
      if (showLogo && this.logo.getAttribute('src') !== st.logo) this.logo.src = st.logo;
      this.labelText.textContent = text;
      this.labelText.hidden = !text.trim();
    }

    _content() {
      const s = this.state;
      if (!s) return [];
      if (s.emergency.active) {
        const t = s.emergency.text.trim();
        return t ? [t] : [];
      }
      return s.messages.filter((m) => m.on && m.text.trim()).map((m) => m.text.trim());
    }

    _makeSeg() {
      const items = this._content();
      if (!items.length) return null;
      const seg = document.createElement('div');
      seg.className = 'seg';
      for (const t of items) {
        const item = document.createElement('span');
        item.className = 'item';
        item.textContent = t.replace(/\s*\n\s*/g, ' ');
        const sep = document.createElement('span');
        sep.className = 'sep';
        sep.textContent = this.state.style.separator;
        seg.append(item, sep);
      }
      return seg;
    }

    _measure(el) {
      el.style.width = '';
      const w = Math.ceil(el.getBoundingClientRect().width / this.scale - 0.01);
      el.style.width = w + 'px';
      return w;
    }

    _fill() {
      const vw = this.viewport.clientWidth;
      if (!this.segs.length) this.offset = vw;
      let end = this.offset + this.segs.reduce((a, s) => a + s.w, 0);
      while (end < vw + 2 && this.segs.length < 400) {
        const el = this._makeSeg();
        if (!el) break;
        this.track.appendChild(el);
        const w = this._measure(el);
        if (w < 1) { el.remove(); break; }
        this.segs.push({ el, w });
        end += w;
      }
    }

    restart() {
      this.track.replaceChildren();
      this.segs = [];
      this._fill();
      this._render();
    }

    remeasure() {
      for (const s of this.segs) s.w = this._measure(s.el);
      this._fill();
      this._render();
    }

    _tick(frames) {
      if (!this.state) return;
      if (this.segs.length) {
        this.offset -= (this.state.style.speed * this.frameMs / 1000) * frames;
        while (this.segs.length && this.offset + this.segs[0].w <= 0) {
          const first = this.segs.shift();
          this.offset += first.w;
          first.el.remove();
        }
      }
      this._fill();
      this._render();
    }

    _render() {
      let x = this.offset;
      if (this.state && this.state.style.pixelSnap) {
        const px = this.scale * (global.devicePixelRatio || 1);
        x = Math.round(x * px) / px;
      }
      this.track.style.transform = `translate3d(${x}px,0,0)`;
    }

    // 실제 화면 주사율을 측정해 프레임마다 같은 거리만큼 이동 → 떨림 없는 일정한 속도
    _loop(now) {
      requestAnimationFrame(this._loop);
      if (!this._last) { this._last = now; return; }
      const dt = now - this._last;
      this._last = now;
      if (this._samples.length < 120 && dt > 3 && dt < 40) {
        this._samples.push(dt);
        if (this._samples.length === 120) {
          this.frameMs = [...this._samples].sort((a, b) => a - b)[60];
        }
      }
      this._tick(Math.min(8, Math.max(1, Math.round(dt / this.frameMs))));
    }
  }

  /* ---------- 떠다니는 멘트 ----------
   * 등록된 멘트를 차례로 말풍선으로 띄운다. 새로 추가된 멘트는 대기열 맨 앞에 넣어 바로 보여 주고,
   * 위치는 이미 떠 있는 말풍선과 가장 멀리 떨어진 후보를 골라 겹침을 줄인다. */
  const PASTELS = [
    ['#fde68a', '#422006'], ['#bbf7d0', '#052e16'], ['#bfdbfe', '#172554'], ['#fbcfe8', '#500724'],
    ['#ddd6fe', '#2e1065'], ['#fed7aa', '#431407'], ['#a5f3fc', '#083344'], ['#fecaca', '#450a0a'],
  ];
  const FADE_IN = 0.6;
  const FADE_OUT = 0.8;

  class FloatLayer {
    constructor(stage) {
      this.stage = stage;
      this.layer = document.createElement('div');
      this.layer.className = 'floats';
      stage.prepend(this.layer); // 티커 바 뒤로 지나가도록 맨 앞(아래층)에 둔다
      this.scale = 1;
      this.state = null;
      this.bubbles = [];
      this.queue = [];
      this.seen = new Set();
      this.cursor = 0;
      this.colorIndex = 0;
      this.sinceSpawn = Infinity;
      this._last = 0;
      this._loop = this._loop.bind(this);
      requestAnimationFrame(this._loop);
    }

    setScale(scale) {
      this.scale = scale;
    }

    setState(s) {
      const first = !this.state;
      this.state = s;
      const st = s.style;
      const v = (k, val) => this.layer.style.setProperty(k, val);
      v('--f-fs', st.floatFontSize + 'px');
      v('--f-fw', String(st.floatWeight));
      v('--f-maxw', st.floatMaxWidth + 'px');
      v('--font', fontStack(st));
      this.layer.dataset.shape = st.floatShape;

      for (const it of s.floats.items) {
        if (this.seen.has(it.id)) continue;
        this.seen.add(it.id);
        if (!first && it.on && it.text.trim()) this.queue.push(it.id);
      }
      for (const b of this.bubbles) {
        const it = s.floats.items.find((i) => i.id === b.id);
        if (!it || !it.on || !it.text.trim()) b.dying = true;
        else if (it.text !== b.text) { b.text = it.text; b.el.firstChild.textContent = it.text; }
        if (st.floatColorMode === 'single') this._paint(b.el, null);
      }
      if (!this._active()) for (const b of this.bubbles) b.dying = true;
    }

    _active() {
      const s = this.state;
      return !!s && s.floats.visible && !s.emergency.active;
    }

    _items() {
      return this.state.floats.items.filter((i) => i.on && i.text.trim());
    }

    _next() {
      const items = this._items();
      if (!items.length) return null;
      while (this.queue.length) {
        const it = items.find((i) => i.id === this.queue[0]);
        this.queue.shift();
        if (it) return it;
      }
      for (let k = 0; k < items.length; k++) {
        const it = items[this.cursor++ % items.length];
        if (!this.bubbles.some((b) => b.id === it.id && !b.dying)) return it;
      }
      return null;
    }

    // 티커 바를 피한 표시 영역 (1920×1080 기준 좌표)
    _area() {
      const st = this.state.style;
      const bar = st.marginY + st.barHeight + 30;
      let top = 50;
      let bottom = STAGE_H - 50;
      if (this.state.visible) {
        if (st.position === 'top') top = Math.max(top, bar);
        else bottom = Math.min(bottom, STAGE_H - bar);
      }
      const mid = (top + bottom) / 2;
      if (st.floatArea === 'upper') bottom = mid;
      if (st.floatArea === 'lower') top = mid;
      return { left: 60, right: STAGE_W - 60, top, bottom };
    }

    _paint(el, colors) {
      const st = this.state.style;
      el.style.setProperty('--f-bg', colors ? colors[0] : st.floatBg);
      el.style.setProperty('--f-color', colors ? colors[1] : st.floatColor);
    }

    _spawn(it) {
      const st = this.state.style;
      const el = document.createElement('div');
      el.className = 'float';
      const span = document.createElement('span');
      span.textContent = it.text;
      el.append(span);
      this._paint(el, st.floatColorMode === 'rainbow' ? PASTELS[this.colorIndex++ % PASTELS.length] : null);
      el.style.opacity = '0';
      this.layer.appendChild(el);
      const r = el.getBoundingClientRect();
      const w = r.width / this.scale;
      const h = r.height / this.scale;
      const a = this._area();
      const maxX = Math.max(a.left, a.right - w);
      const maxY = Math.max(a.top, a.bottom - h);
      const rand = (lo, hi) => lo + Math.random() * (hi - lo);

      // 후보 위치 중 기존 말풍선과 가장 먼 곳
      const candidate = () => {
        if (st.floatMotion === 'rise') return { x: rand(a.left, maxX), y: maxY };
        if (st.floatMotion === 'fly') return { x: STAGE_W + 20, y: rand(a.top, maxY) };
        return { x: rand(a.left, maxX), y: rand(a.top, maxY) };
      };
      let best = candidate();
      let bestD = -1;
      for (let i = 0; i < 12; i++) {
        const c = i ? candidate() : best;
        let d = Infinity;
        for (const b of this.bubbles) d = Math.min(d, Math.hypot(b.x - c.x, (b.y - c.y) * 1.6));
        if (d > bestD) { bestD = d; best = c; }
      }
      const angle = Math.random() * Math.PI * 2;
      this.bubbles.push({
        id: it.id, text: it.text, el, w, h, x: best.x, y: best.y, x0: best.x,
        vx: Math.cos(angle), vy: Math.sin(angle) * 0.6,
        age: 0, phase: Math.random() * Math.PI * 2, dying: false, dieAt: 0,
      });
    }

    _step(dt) {
      const st = this.state.style;
      const a = this._area();
      const speed = st.floatSpeed;
      const alive = this.bubbles.filter((b) => !b.dying).length;

      if (this._active()) {
        this.sinceSpawn += dt;
        const urgent = this.queue.length > 0 && alive < st.floatMax + 2;
        if (urgent || (this.sinceSpawn >= st.floatInterval && alive < st.floatMax)) {
          const it = this._next();
          if (it) { this._spawn(it); this.sinceSpawn = 0; }
        }
      }

      for (const b of this.bubbles) {
        b.age += dt;
        if (st.floatMotion === 'rise') {
          b.y -= speed * dt;
          b.x = b.x0 + Math.sin(b.age * 0.9 + b.phase) * 28;
          if (b.y < a.top + 40) b.dying = true;
        } else if (st.floatMotion === 'fly') {
          b.x -= speed * 2 * dt;
          if (b.x + b.w < -20) { b.dying = true; b.dieAt = -FADE_OUT; }
        } else {
          b.x += b.vx * speed * 0.35 * dt;
          b.y += (b.vy * speed * 0.35 + Math.sin(b.age * 1.3 + b.phase) * 14) * dt;
          if (b.x < a.left || b.x + b.w > a.right) b.vx = b.x < a.left ? Math.abs(b.vx) : -Math.abs(b.vx);
          if (b.y < a.top || b.y + b.h > a.bottom) b.vy = b.y < a.top ? Math.abs(b.vy) : -Math.abs(b.vy);
          if (b.age > st.floatLife) b.dying = true;
        }
        if (b.dying && !b.dieAt) b.dieAt = b.age;

        const fadeIn = Math.min(1, b.age / FADE_IN);
        const fadeOut = b.dying ? Math.max(0, 1 - (b.age - b.dieAt) / FADE_OUT) : 1;
        const op = Math.min(fadeIn, fadeOut);
        const sc = 0.85 + 0.15 * fadeIn;
        b.el.style.opacity = op.toFixed(3);
        b.el.style.transform = `translate3d(${b.x}px,${b.y}px,0) scale(${sc.toFixed(3)})`;
        b.gone = b.dying && fadeOut <= 0;
      }
      this.bubbles = this.bubbles.filter((b) => {
        if (b.gone) b.el.remove();
        return !b.gone;
      });
    }

    _loop(now) {
      requestAnimationFrame(this._loop);
      const dt = this._last ? Math.min(0.1, (now - this._last) / 1000) : 0;
      this._last = now;
      if (this.state) this._step(dt);
    }
  }

  global.Ticker = { STAGE_W, STAGE_H, PRESETS, uid, defaultState, normalize, pickColors, createBus, Renderer, FloatLayer };
})(window);
