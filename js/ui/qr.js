// 二维码扫描 & 生成 — 用于导入/导出 API 配置
// 依赖 CDN：jsQR（扫描） + qrcode-generator（生成，容量计算更准）
import { setConfig, clearConfig, loadConfig, ApiCfg } from '../ai/api-bot.js';
import { openModal, closeModal, View } from './render.js';

let _libsLoaded = false;
async function ensureLibs() {
  if (_libsLoaded) return true;
  const srcs = [
    'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js',
    'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js'
  ];
  await Promise.all(srcs.map(s => new Promise(res => {
    const el = document.createElement('script');
    el.src = s; el.onload = res; el.onerror = res;
    document.head.appendChild(el);
  })));
  _libsLoaded = !!(window.jsQR && (window.qrcode || window.QRCode));
  return _libsLoaded;
}

// ===== 校验 JSON =====
export function validateCfg(obj) {
  const errs = [];
  if (!obj || typeof obj !== 'object') return ['不是 JSON 对象'];
  if (obj.schema !== 'sgs-ai-endpoint/v1') errs.push('schema 字段错误或缺失（应为 "sgs-ai-endpoint/v1"）');
  if (!obj.endpoint || !/^https?:\/\//i.test(obj.endpoint)) errs.push('endpoint 必须是 http(s):// 开头的完整 URL');
  if (!obj.model || typeof obj.model !== 'string') errs.push('model 字段缺失');
  if (obj.temperature != null && (typeof obj.temperature !== 'number' || obj.temperature < 0 || obj.temperature > 2)) errs.push('temperature 应在 0–2 之间');
  if (obj.maxTokens != null && (!Number.isInteger(obj.maxTokens) || obj.maxTokens < 1)) errs.push('maxTokens 应为正整数');
  if (obj.seat && obj.seat.mode && !['replace-one','replace-all','assist'].includes(obj.seat.mode)) errs.push(`seat.mode 无效: ${obj.seat.mode}`);
  return errs;
}

// ===== 打开 API 配置面板 =====
export async function openApiCfgModal(onSaved) {
  const cur = loadConfig();
  const curJson = cur ? JSON.stringify(cur, null, 2) : DEFAULT_TEMPLATE;
  const ok = await ensureLibs();
  openModal({
    title: 'AI API 配置',
    body: `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
        <div>
          <div style="color:#f5dfa3;letter-spacing:2px;margin-bottom:6px;">① 扫二维码导入</div>
          <div style="background:#120a04;border:1px solid #8a6a25;border-radius:4px;height:220px;display:grid;place-items:center;position:relative;overflow:hidden;" id="qr-scanner">
            <video id="qr-video" playsinline style="width:100%;height:100%;object-fit:cover;display:none;"></video>
            <canvas id="qr-canvas" style="display:none;"></canvas>
            <div id="qr-scan-hint" style="color:#c8b68c;font-size:12px;text-align:center;padding:12px;">
              ${ok ? '点击下方"启动摄像头"开始扫码<br/><span style="font-size:11px;opacity:.6;">(需 HTTPS 或 localhost，浏览器会请求权限)</span>' : '<span style="color:#f2a89b;">扫码库未加载（离线）<br/>请用"手动粘贴 JSON"入口</span>'}
            </div>
          </div>
          <div style="display:flex;gap:6px;margin-top:8px;">
            <button class="btn ghost small" id="btn-cam-start">启动摄像头</button>
            <button class="btn ghost small" id="btn-cam-stop">停止</button>
            <button class="btn ghost small" id="btn-upload-qr">从图片识别</button>
            <input type="file" id="qr-file" accept="image/*" style="display:none;" />
          </div>
        </div>
        <div>
          <div style="color:#f5dfa3;letter-spacing:2px;margin-bottom:6px;">② 手动粘贴 JSON</div>
          <textarea id="cfg-json" style="width:100%;height:220px;background:#120a04;color:#e8d8b3;border:1px solid #8a6a25;border-radius:4px;padding:8px;font-family:monospace;font-size:11px;resize:vertical;" spellcheck="false">${escapeHtml(curJson)}</textarea>
          <div style="display:flex;gap:6px;margin-top:8px;">
            <button class="btn ghost small" id="btn-fill-tpl">填入模板</button>
            <button class="btn ghost small" id="btn-gen-qr">生成二维码</button>
            <button class="btn primary small" id="btn-save">保存配置</button>
            <button class="btn ghost small" id="btn-clear">清除</button>
          </div>
        </div>
      </div>
      <div id="qr-gen-slot" style="margin-top:12px;text-align:center;"></div>
      <div id="cfg-status" style="margin-top:8px;color:#c8b68c;font-size:12px;min-height:20px;">${cur ? '当前已配置: <b style="color:#a8dc9b;">'+escapeHtml(cur.name||'未命名')+'</b> → '+escapeHtml(cur.endpoint||'') : '尚未配置'}</div>
    `,
    hideFooter: true,
    onMount: () => setupHandlers(onSaved)
  });
}

const DEFAULT_TEMPLATE = `{
  "schema": "sgs-ai-endpoint/v1",
  "name": "我的AI",
  "provider": "openai-compat",
  "endpoint": "https://api.openai.com/v1/chat/completions",
  "apiKey": "sk-xxxxxxxxxxxxxxxxxxxx",
  "model": "gpt-4o-mini",
  "temperature": 0.6,
  "maxTokens": 600,
  "responseFormat": "json",
  "timeoutMs": 20000,
  "seat": { "mode": "replace-one", "index": -1, "fallback": "local-bot" }
}`;

function escapeHtml(s) { return String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

// 把非 ASCII 字符转成 \uXXXX，避免二维码阅读器把 UTF-8 当 Latin-1 处理
export function asciiEscape(s) {
  return String(s).replace(/[\u0080-\uffff]/g, c =>
    '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0')
  );
}
export function asciiUnescape(s) {
  // JSON.parse 已经能处理 \uXXXX；这里仅做兜底
  try { return JSON.parse('"' + String(s).replace(/\\/g,'\\\\').replace(/"/g,'\\"') + '"'); }
  catch (_) { return s; }
}

// 压缩配置：去掉默认值 & 空字段，缩减 QR 载荷
export function compressCfg(obj) {
  const out = {};
  // 极简 schema — 二维码版可省略 schema 字段（识别时会补默认）
  const keep = ['schema','name','provider','endpoint','apiKey','model','temperature','maxTokens','topP','requestFormat','responsePath','responseFormat','timeoutMs','seat','systemPromptOverride'];
  keep.forEach(k => {
    const v = obj[k];
    if (v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length)) return;
    if (typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).length) return;
    // 默认值省略
    if (k === 'schema' && v === 'sgs-ai-endpoint/v1') return;
    if (k === 'provider' && v === 'openai-compat') return;
    if (k === 'temperature' && v === 0.6) return;
    if (k === 'maxTokens' && v === 600) return;
    if (k === 'topP' && v === 1) return;
    if (k === 'requestFormat' && v === 'openai') return;
    if (k === 'responseFormat' && v === 'json') return;
    if (k === 'timeoutMs' && v === 20000) return;
    if (k === 'responsePath') return; // 依赖 provider 自动推断
    if (k === 'seat') {
      const s = v || {};
      const seatOut = {};
      if (s.mode && s.mode !== 'replace-one') seatOut.mode = s.mode;
      if (s.index != null && s.index >= 0) seatOut.index = s.index;
      if (s.difficulty && s.difficulty !== 'normal') seatOut.difficulty = s.difficulty;
      if (s.fallback && s.fallback !== 'local-bot') seatOut.fallback = s.fallback;
      if (Object.keys(seatOut).length) out.seat = seatOut;
      return;
    }
    out[k] = v;
  });
  // 保证 schema 字段总在（方便识别）
  out.schema = out.schema || 'sgs-ai-endpoint/v1';
  return out;
}

function setupHandlers(onSaved) {
  const ta = document.getElementById('cfg-json');
  const status = document.getElementById('cfg-status');
  let stream = null, raf = null;

  function setStatus(msg, ok) {
    status.innerHTML = `<span style="color:${ok === false ? '#f2a89b' : ok ? '#a8dc9b' : '#c8b68c'};">${msg}</span>`;
  }

  document.getElementById('btn-fill-tpl').onclick = () => {
    ta.value = DEFAULT_TEMPLATE;
    setStatus('已填入模板，替换成你自己的 API 信息即可', true);
  };
  document.getElementById('btn-clear').onclick = () => {
    clearConfig();
    ta.value = DEFAULT_TEMPLATE;
    setStatus('配置已清除', true);
    onSaved && onSaved(null);
  };
  document.getElementById('btn-save').onclick = () => {
    let obj;
    try { obj = JSON.parse(ta.value); }
    catch (e) { setStatus('JSON 解析失败: ' + e.message, false); return; }
    const errs = validateCfg(obj);
    if (errs.length) { setStatus('配置无效：<br/>' + errs.map(e=>'· '+escapeHtml(e)).join('<br/>'), false); return; }
    setConfig(obj);
    setStatus(`已保存配置：<b style="color:#a8dc9b;">${escapeHtml(obj.name||'未命名')}</b> · 座位策略 ${escapeHtml(obj.seat?.mode||'replace-one')}`, true);
    onSaved && onSaved(obj);
  };
  document.getElementById('btn-gen-qr').onclick = async () => {
    if (!(window.qrcode || window.QRCode)) { setStatus('未加载二维码库（无网络）', false); return; }
    let obj;
    try { obj = JSON.parse(ta.value); } catch (e) { setStatus('JSON 无效: '+e.message, false); return; }
    const errs = validateCfg(obj);
    if (errs.length) { setStatus('配置无效: ' + errs[0], false); return; }
    const compact = compressCfg(obj);
    const json = JSON.stringify(compact);
    if (json.length > 2500) {
      setStatus(`JSON 长度 ${json.length} 字节，超过二维码舒适容量。请精简 apiKey / endpoint 或去掉可选字段。`, false);
      return;
    }
    const slot = document.getElementById('qr-gen-slot');
    slot.innerHTML = `<div style="color:#c8b68c;font-size:12px;margin-bottom:6px;">扫描下图导入到另一台设备：</div><div id="qr-out" style="display:inline-block;padding:8px;background:#fff;border:2px solid #f2e5c9;border-radius:4px;"></div><div style="font-size:11px;color:#8d7c5a;margin-top:4px;">${json.length} 字节 · 已压缩可选字段</div>`;
    const out = document.getElementById('qr-out');
    try {
      // qrcode-generator：0=自动 typeNumber，L=最低纠错以获得最大容量
      // 关键：先把非 ASCII 字符转义成 \uXXXX，避开 jsQR 读取 Byte 模式时把 UTF-8 当 Latin-1 的坑
      const ascii = asciiEscape(json);
      const qr = window.qrcode(0, 'L');
      qr.addData(ascii, 'Byte');
      qr.make();
      const count = qr.getModuleCount();
      const cell = 5;
      const quiet = 4 * cell;
      const size = count * cell + quiet * 2;
      const canvas = document.createElement('canvas');
      canvas.width = size; canvas.height = size;
      canvas.style.width = '260px'; canvas.style.height = '260px';
      canvas.style.imageRendering = 'pixelated';
      const cx = canvas.getContext('2d');
      cx.fillStyle = '#fff'; cx.fillRect(0, 0, size, size);
      cx.fillStyle = '#000';
      for (let r = 0; r < count; r++) {
        for (let c = 0; c < count; c++) {
          if (qr.isDark(r, c)) cx.fillRect(quiet + c*cell, quiet + r*cell, cell, cell);
        }
      }
      out.innerHTML = '';
      out.appendChild(canvas);
      setStatus(`二维码已生成 · ${count}×${count} 模块 · ASCII ${ascii.length} 字节（原 ${json.length}）`, true);
    } catch (e) {
      setStatus('生成失败: '+e.message+' — 请精简 JSON 或换用手动粘贴', false);
    }
  };

  // 摄像头
  const video = document.getElementById('qr-video');
  const canvas = document.getElementById('qr-canvas');
  const hint = document.getElementById('qr-scan-hint');

  async function stopCam() {
    if (raf) { cancelAnimationFrame(raf); raf = null; }
    if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
    video.style.display = 'none';
    hint.style.display = 'grid';
  }
  document.getElementById('btn-cam-stop').onclick = stopCam;
  document.getElementById('btn-cam-start').onclick = async () => {
    if (!window.jsQR) { setStatus('未加载 jsQR 库（无网络）', false); return; }
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      video.srcObject = stream;
      await video.play();
      video.style.display = 'block';
      hint.style.display = 'none';
      setStatus('摄像头已启动，把二维码对准画面…', true);
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      const tick = () => {
        if (!stream) return;
        if (video.readyState === video.HAVE_ENOUGH_DATA) {
          canvas.width = video.videoWidth; canvas.height = video.videoHeight;
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = window.jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
          if (code && code.data) {
            onScan(code.data, setStatus);
            stopCam();
            return;
          }
        }
        raf = requestAnimationFrame(tick);
      };
      tick();
    } catch (e) {
      setStatus('摄像头启动失败: '+e.message+'（HTTPS/localhost 才能用）', false);
    }
  };
  document.getElementById('btn-upload-qr').onclick = () => document.getElementById('qr-file').click();
  document.getElementById('qr-file').onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    if (!window.jsQR) { setStatus('未加载 jsQR 库', false); return; }
    const img = new Image();
    img.onload = () => {
      const cv = document.createElement('canvas');
      cv.width = img.width; cv.height = img.height;
      const cx = cv.getContext('2d');
      cx.drawImage(img, 0, 0);
      const d = cx.getImageData(0, 0, cv.width, cv.height);
      const code = window.jsQR(d.data, d.width, d.height);
      if (code && code.data) onScan(code.data, setStatus);
      else setStatus('图片中未识别到二维码', false);
    };
    img.src = URL.createObjectURL(f);
  };
}

function onScan(text, setStatus) {
  setStatus('扫码成功，解析中…', true);
  let obj;
  try { obj = JSON.parse(text); }
  catch (e) { setStatus('扫到的不是有效 JSON: '+e.message, false); return; }
  const errs = validateCfg(obj);
  if (errs.length) { setStatus('配置无效：<br/>' + errs.map(x=>'· '+escapeHtml(x)).join('<br/>'), false); return; }
  setConfig(obj);
  const ta = document.getElementById('cfg-json');
  if (ta) ta.value = JSON.stringify(obj, null, 2);
  setStatus(`已导入并保存：<b style="color:#a8dc9b;">${escapeHtml(obj.name||'未命名')}</b> → ${escapeHtml(obj.endpoint)}`, true);
}
