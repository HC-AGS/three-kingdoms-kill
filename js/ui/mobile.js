// 手机端适配：横屏引导 + 全屏请求 + 触摸/方向监听
// 触发条件：
//  - isMobile(userAgent / coarse pointer)
//  - 竖屏（orientation === 'portrait'）时弹提示
//  - 用户点"进入全屏" → 请求 fullscreen + 尝试锁定横屏；关闭后写 localStorage 记住
export const Mobile = {
  isMobile: false,
  isLandscape: true,
  gateDismissed: false,
  init() {
    this.isMobile = detectMobile();
    document.documentElement.classList.toggle('is-mobile', this.isMobile);
    this.isLandscape = this.checkLandscape();
    this.gateDismissed = localStorage.getItem('sgs-mobile-gate-dismissed') === '1';
    window.addEventListener('resize', () => this.onResize(), { passive: true });
    window.addEventListener('orientationchange', () => this.onResize(), { passive: true });
    if (typeof screen !== 'undefined' && screen.orientation) {
      screen.orientation.addEventListener?.('change', () => this.onResize());
    }
    document.addEventListener('fullscreenchange', () => this.refreshGate());
    document.addEventListener('webkitfullscreenchange', () => this.refreshGate());
    this.bindGateButtons();
    this.refreshGate();
  },
  checkLandscape() {
    if (typeof screen !== 'undefined' && screen.orientation && typeof screen.orientation.angle === 'number') {
      return screen.orientation.angle === 90 || screen.orientation.angle === 270;
    }
    return window.innerWidth >= window.innerHeight;
  },
  onResize() {
    this.isLandscape = this.checkLandscape();
    this.refreshGate();
    // 座位区加 seat-count 类（供 CSS 布局）
    const seats = document.getElementById('seats');
    if (seats && seats.children.length) {
      seats.className = 'seats seat-count-' + seats.children.length;
    }
  },
  refreshGate() {
    const gate = document.getElementById('orientation-gate');
    if (!gate) return;
    const shouldShow = this.isMobile && !this.isLandscape && !this.gateDismissed;
    if (shouldShow) gate.hidden = false;
    else gate.hidden = true;
    // 状态更新
    this.updateGateStatus();
  },
  updateGateStatus() {
    const hint = document.getElementById('og-hint');
    if (!hint) return;
    const isFs = document.fullscreenElement || document.webkitFullscreenElement;
    if (this.isLandscape && isFs) {
      hint.innerHTML = `<span class="og-status ok">✓ 横屏 · 全屏</span>`;
    } else if (this.isLandscape) {
      hint.innerHTML = `<span class="og-status">横屏就绪 · 点"进入全屏"</span>`;
    } else {
      hint.innerHTML = `iOS Safari 需通过底部菜单 → 全屏 · 部分安卓会自动旋转锁定`;
    }
  },
  bindGateButtons() {
    const confirm = document.getElementById('og-confirm');
    const skip = document.getElementById('og-skip');
    if (confirm) confirm.addEventListener('click', async () => {
      await this.enterFullscreen();
      await this.tryLockLandscape();
      this.gateDismissed = true;
      try { localStorage.setItem('sgs-mobile-gate-dismissed', '1'); } catch (_) {}
      this.refreshGate();
    });
    if (skip) skip.addEventListener('click', () => {
      this.gateDismissed = true;
      try { localStorage.setItem('sgs-mobile-gate-dismissed', '1'); } catch (_) {}
      this.refreshGate();
    });
  },
  async enterFullscreen() {
    const el = document.documentElement;
    try {
      if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' });
      else if (el.webkitRequestFullscreen) await el.webkitRequestFullscreen();
      else if (el.msRequestFullscreen) await el.msRequestFullscreen();
      else return { ok: false, msg: '当前浏览器不支持全屏 API' };
      return { ok: true };
    } catch (e) {
      console.warn('fullscreen fail', e);
      return { ok: false, msg: e.message || '全屏请求被拒绝' };
    }
  },
  async exitFullscreen() {
    try {
      if (document.exitFullscreen) await document.exitFullscreen();
      else if (document.webkitExitFullscreen) await document.webkitExitFullscreen();
    } catch (_) {}
  },
  async tryLockLandscape() {
    try {
      if (screen.orientation && screen.orientation.lock) {
        await screen.orientation.lock('landscape');
      }
    } catch (e) {
      // iOS/部分浏览器不支持方向锁定，忽略
    }
  },
  async tryUnlockOrientation() {
    try { screen.orientation?.unlock?.(); } catch (_) {}
  }
};

function detectMobile() {
  // 用 UA + coarse pointer 双检测
  const uaMatch = /Android|iPhone|iPad|iPod|Mobile|Windows Phone|HarmonyOS|MIUI/i.test(navigator.userAgent || '');
  const coarseMatch = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  const smallMatch = window.matchMedia && window.matchMedia('(max-width: 900px)').matches;
  return uaMatch || (coarseMatch && smallMatch);
}

// 提供"重新显示引导"入口 — 用户可能想再进一次全屏
export function showGateAgain() {
  Mobile.gateDismissed = false;
  try { localStorage.removeItem('sgs-mobile-gate-dismissed'); } catch (_) {}
  Mobile.refreshGate();
}
