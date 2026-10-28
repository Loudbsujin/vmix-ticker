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
      style: {
        preset: 'midnight',
        ...pickColors(PRESETS.midnight),
        position: 'bottom',
        barHeight: 96,
        marginX: 0,
        marginY: 0,
        radius: 0,
        keyColor: '#00ff00',
        labelShow: true,
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
    'labelShow', 'labelText', 'labelShape', 'labelFontSize', 'logo', 'logoHeight', 'emergencyLabel',
  ];

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

      this.stage.classList.toggle('emergency', emergency);
      this.bar.classList.toggle('top', st.position === 'top');
      this.bar.classList.toggle('accent', !!st.accentLine);
      this.viewport.classList.toggle('fade', !!st.edgeFade);
      this.label.className = 'label shape-' + (st.labelShape || 'rect');

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

  global.Ticker = { STAGE_W, STAGE_H, PRESETS, uid, defaultState, normalize, pickColors, createBus, Renderer };
})(window);
