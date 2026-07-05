/* ============================================================
   NHSO Web App — app.js
   Google OAuth 2.0 (GIS) + Google Sheets API v4
============================================================ */

// ─── State ────────────────────────────────────────────────
const STATE = {
  user:         null,
  accessToken:  null,
  tokenClient:  null,
  role:         null,   // 'admin' | 'viewer' | null
  rows:         [],     // raw data from Sheet (array of arrays)
  headers:      [],     // first row = column names
  filtered:     [],     // rows after search/filter
  sortCol:      null,
  sortDir:      'asc',
  page:         1,
  pageSize:     25,
  editRowIndex: null,   // 0-based index in STATE.rows (null = new)
  detailRow:    null,
  cardFilter:   null,   // drill-down จาก stat card: 'lived'|'transit'|'contract'|'waiting'|'paid'
};

// ─── Column index helpers ──────────────────────────────────
const COL = {};   // filled after headers loaded

function buildColIndex() {
  STATE.headers.forEach((h, i) => {
    for (const [key, name] of Object.entries(CONFIG.COLUMNS)) {
      if (h === name) COL[key] = i;
    }
  });
}

function getCell(row, key) {
  return (row && COL[key] !== undefined) ? (row[COL[key]] ?? '') : '';
}

// B5: escape ค่าจาก Sheet ก่อนยัดลง innerHTML / value="…"
// กันชื่อที่มี " < > พังฟอร์ม-ตาราง และกัน HTML injection
function esc(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// B6: เปรียบเทียบแบบรู้ชนิดข้อมูล — ตัวเลขเทียบเป็นตัวเลข (เขต 2 < 10),
// วันที่ M/D/YYYY เทียบตามเวลา, ที่เหลือเทียบตามตัวอักษรไทย
function parseSheetDate(s) {
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);          // M/D/YYYY จาก Sheets
  if (m) return new Date(+m[3], +m[1] - 1, +m[2]).getTime();
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);                     // YYYY-MM-DD จาก input date
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]).getTime();
  return null;
}

function smartCompare(sa, sb) {
  if (/^-?[\d.]+$/.test(sa) && /^-?[\d.]+$/.test(sb)) return parseFloat(sa) - parseFloat(sb);
  const da = parseSheetDate(sa), db = parseSheetDate(sb);
  if (da !== null && db !== null) return da - db;
  return sa.localeCompare(sb, 'th');
}

// ─── Toast ────────────────────────────────────────────────
function toast(msg, type = 'info') {
  const icons = { info: 'ℹ️', success: '✅', error: '❌', warning: '⚠️' };
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span class="toast-icon">${icons[type]}</span><span class="toast-msg">${msg}</span>`;
  document.getElementById('toast-container').prepend(el);
  setTimeout(() => el.remove(), 4000);
}

// ─── Status Badge ──────────────────────────────────────────
function statusBadge(status) {
  const map = {
    'Lived':                                 'badge-lived',
    'Contract in progress':                  'badge-contract',
    'Ready for Training':                    'badge-training',
    'Machine in Transit':                    'badge-transit',
    'In process config network with IT':     'badge-process',
    'Waiting for Integrate with PACS':       'badge-waiting',
    'Waiting for Swaping':                   'badge-waiting',
    'Ready for Sending Waiting for address': 'badge-ready',
  };
  // สถานะ "Lived …" ที่ไม่อยู่ใน map (เช่น Lived and Re-Check) → badge เขียวเหมือน Lived
  const cls = map[status] || (String(status).trim().startsWith('Lived') ? 'badge-lived' : 'badge-default');
  const short = {
    'Contract in progress': 'Contract',
    'Ready for Training': 'Ready Train',
    'Machine in Transit': 'In Transit',
    'In process config network with IT': 'Config Net',
    'Waiting for Integrate with PACS': 'Wait PACS',
    'Ready for Sending Waiting for address': 'Ready Send',
    'Waiting for Swaping': 'Wait Swap',
  };
  return `<span class="badge ${cls}">${esc(short[status] || status || '-')}</span>`;
}

function isTruthy(val) {
  const v = String(val).toLowerCase();
  return v === 'true' || v === 'yes' || v === '1';
}

// สถานะสำหรับแสดงผล: ถ้ายังไม่มี Implement Status จริง แต่ Sales Doc = TRUE
// → แสดง "Contract in progress" (อยู่ระหว่างทำสัญญา)
function displayStatus(row) {
  const s = getCell(row, 'STATUS');
  if (s && s !== '-') return s;                       // มีสถานะติดตั้งจริงแล้ว → คงไว้
  if (isTruthy(getCell(row, 'SALES_DOC'))) return 'Contract in progress';
  return s;
}

function boolIcon(val) {
  const v = String(val).toLowerCase();
  if (v === 'true' || v === 'yes' || v === '1') return '<span class="text-green">✔</span>';
  if (v === 'false' || v === 'no' || v === '0') return '<span class="text-red">✗</span>';
  return '<span class="text-gray">-</span>';
}

// ─── Stat card groups (นิยามกลาง: dashboard + drill-down ใช้ชุดเดียวกัน) ───
const PROGRESS_STATUSES = ['Machine in Transit','In process config network with IT','Ready for Training'];
const WAITING_STATUSES  = ['Waiting for Integrate with PACS','Waiting for Swaping','Ready for Sending Waiting for address','-',''];

// B3: สถานะที่ขึ้นต้นด้วย "Lived" ทั้งหมดถือว่า Golive แล้ว
// (ครอบคลุม "Lived and Re-Check…" และ variant อื่นในอนาคต)
const isLivedStatus = s => String(s).trim().startsWith('Lived');

const CARD_FILTERS = {
  lived:    { label: 'Golive แล้ว',       test: r => isLivedStatus(getCell(r,'STATUS')) },
  transit:  { label: 'กำลังดำเนินการ',     test: r => PROGRESS_STATUSES.includes(getCell(r,'STATUS')) },
  contract: { label: 'อยู่ระหว่างทำสัญญา', test: r => displayStatus(r) === 'Contract in progress' },
  waiting:  { label: 'รอดำเนินการ',        test: r => WAITING_STATUSES.includes(getCell(r,'STATUS')) && displayStatus(r) !== 'Contract in progress' },
  paid:     { label: 'ชำระแล้ว',           test: r => getCell(r,'PAID').toLowerCase() === 'true' },
};

// คลิก stat card → ไปหน้า รายการโรงพยาบาล พร้อมกรองตามกลุ่มของการ์ด
function drillCard(key) {
  if (isViewer()) { toast('⚠️ ไม่มีสิทธิ์เข้าถึงหน้านี้', 'warning'); return; }
  STATE.cardFilter = CARD_FILTERS[key] ? key : null;   // 'total' → null = ดูทั้งหมด
  navigateTo('hospitals');
  const bar = document.getElementById('card-filter-bar');
  if (STATE.cardFilter) {
    document.getElementById('card-filter-label').textContent = CARD_FILTERS[key].label;
    bar?.classList.remove('hidden');
  } else {
    bar?.classList.add('hidden');
  }
  applyFilters();
}

function clearCardFilter() {
  STATE.cardFilter = null;
  document.getElementById('card-filter-bar')?.classList.add('hidden');
  applyFilters();
}

// ════════════════════════════════════════════
// ROLE-BASED ACCESS CONTROL
// ════════════════════════════════════════════
function determineRole(email) {
  if (!email) return null;
  const em = email.toLowerCase();
  if (em.endsWith('@' + CONFIG.ADMIN_DOMAIN)) return 'admin';
  if (CONFIG.VIEWER_EMAILS.map(e => e.toLowerCase()).includes(em)) return 'viewer';
  return null; // ไม่มีสิทธิ์
}

function isAdmin() { return STATE.role === 'admin'; }
function isViewer() { return STATE.role === 'viewer'; }

function applyRoleUI() {
  if (isViewer()) {
    // ซ่อนเมนูที่ Viewer เข้าไม่ได้
    ['hospitals', 'tracking', 'add'].forEach(page => {
      document.querySelector(`.nav-item[data-page="${page}"]`)?.classList.add('hidden');
    });

    // ซ่อน PACS chart card
    document.getElementById('card-pacs')?.classList.add('hidden');

    // ซ่อนปุ่ม Refresh และแสดง View Only badge
    document.getElementById('btn-refresh').classList.add('hidden');
    document.getElementById('sync-text').textContent = '👁 View Only';
    document.getElementById('sync-status').style.color = '#e3a008';
  }
}

// ════════════════════════════════════════════
// GOOGLE AUTH
// ════════════════════════════════════════════
function initAuth() {
  if (typeof google === 'undefined') {
    setTimeout(initAuth, 300);
    return;
  }

  STATE.tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CONFIG.CLIENT_ID,
    scope:     'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email',
    callback:  handleToken,
  });

  document.getElementById('btn-google-login').addEventListener('click', () => {
    STATE.tokenClient.requestAccessToken({ prompt: 'consent' });
  });
}

async function handleToken(response) {
  if (response.error) {
    toast('Login ล้มเหลว: ' + response.error, 'error');
    return;
  }
  STATE.accessToken = response.access_token;
  await fetchUserInfo();

  // ตรวจสอบสิทธิ์
  STATE.role = determineRole(STATE.user?.email);
  if (!STATE.role) {
    toast('❌ ไม่มีสิทธิ์เข้าใช้งาน กรุณาติดต่อผู้ดูแลระบบ', 'error');
    setTimeout(handleLogout, 2500);
    return;
  }

  showApp();
  applyRoleUI();
  await loadSheetData();
}

async function fetchUserInfo() {
  const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${STATE.accessToken}` }
  });
  STATE.user = await res.json();

  // Optional domain restriction
  if (CONFIG.ALLOWED_DOMAIN && !STATE.user.email?.endsWith('@' + CONFIG.ALLOWED_DOMAIN)) {
    toast(`เฉพาะ @${CONFIG.ALLOWED_DOMAIN} เท่านั้น`, 'error');
    handleLogout();
    return;
  }

  // Update sidebar user info
  document.getElementById('user-name').textContent = STATE.user.name || STATE.user.email;
  document.getElementById('user-email').textContent = STATE.user.email || '';
  const avatar = document.getElementById('user-avatar');
  if (STATE.user.picture) {
    avatar.innerHTML = `<img src="${STATE.user.picture}" alt="avatar" />`;
  } else {
    avatar.textContent = (STATE.user.name || 'U')[0].toUpperCase();
  }
}

function handleLogout() {
  if (STATE.accessToken) {
    google.accounts.oauth2.revoke(STATE.accessToken, () => {});
  }
  STATE.user = null;
  STATE.accessToken = null;
  STATE.rows = [];
  document.getElementById('login-screen').classList.remove('hidden');
  document.getElementById('app').classList.add('hidden');
  toast('ออกจากระบบแล้ว', 'info');
}

function showApp() {
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  // ตั้ง state เริ่มต้นให้ history (หน้าแรก = dashboard)
  history.replaceState({ page: 'dashboard' }, '', '#dashboard');
}

// ════════════════════════════════════════════
// GOOGLE SHEETS API
// ════════════════════════════════════════════
async function sheetsGet(range) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SPREADSHEET_ID}/values/${encodeURIComponent(range)}?valueRenderOption=FORMATTED_VALUE`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${STATE.accessToken}` }
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error?.message || 'Sheets API error');
  }
  return res.json();
}

async function sheetsAppend(range, values) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SPREADSHEET_ID}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
  const res = await fetch(url, {
    method:  'POST',
    headers: { Authorization: `Bearer ${STATE.accessToken}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ values }),
  });
  if (!res.ok) throw new Error('Append failed');
  return res.json();
}

async function sheetsUpdate(range, values) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SPREADSHEET_ID}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`;
  const res = await fetch(url, {
    method:  'PUT',
    headers: { Authorization: `Bearer ${STATE.accessToken}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ values }),
  });
  if (!res.ok) throw new Error('Update failed');
  return res.json();
}

async function loadSheetData() {
  document.getElementById('sync-text').textContent = 'กำลังโหลด...';
  try {
    const range = `${CONFIG.SHEET_NAME}!A1:X1000`;
    const data  = await sheetsGet(range);
    const all   = data.values || [];

    if (all.length < 1) {
      toast('ไม่พบข้อมูลใน Sheet', 'warning');
      return;
    }

    STATE.headers = all[0];
    STATE.rows    = all.slice(1);
    buildColIndex();

    // B4: เติม dropdown แบบล้างของเดิมก่อน (กด รีเฟรช แล้ว option ไม่งอกซ้ำ)
    // และคงค่าที่ผู้ใช้เลือกไว้ ถ้าค่านั้นยังมีอยู่ในข้อมูลชุดใหม่
    const fillSelect = (selectId, values, labelFn) => {
      const sel = document.getElementById(selectId);
      if (!sel) return;
      const prev = sel.value;
      while (sel.options.length > 1) sel.remove(1);   // เหลือ option แรก ("ทุก…")
      values.forEach(v => {
        const opt = document.createElement('option');
        opt.value = v; opt.textContent = labelFn(v);
        sel.appendChild(opt);
      });
      if (values.includes(prev)) sel.value = prev;
    };

    const zones = [...new Set(STATE.rows.map(r => getCell(r, 'HEALTH_ZONE')))].filter(Boolean).sort((a, b) => parseFloat(a) - parseFloat(b));
    fillSelect('filter-zone', zones, z => `เขต ${z}`);

    const salesList = [...new Set(STATE.rows.map(r => getCell(r, 'SALES')))].filter(Boolean).sort();
    fillSelect('filter-sales', salesList, s => s);

    applyFilters();
    renderDashboard();
    renderTrackingTable();

    const now = new Date().toLocaleTimeString('th-TH');
    document.getElementById('sync-text').textContent = `อัปเดต ${now}`;
    toast(`โหลดข้อมูล ${STATE.rows.length} รายการสำเร็จ`, 'success');

  } catch (e) {
    toast('โหลดข้อมูลล้มเหลว: ' + e.message, 'error');
    document.getElementById('sync-text').textContent = 'โหลดล้มเหลว';
  }
}

// ════════════════════════════════════════════
// DASHBOARD
// ════════════════════════════════════════════
function renderDashboard() {
  const rows = STATE.rows;
  const total    = rows.length;
  // ใช้นิยามเดียวกับ CARD_FILTERS → เลขการ์ดตรงกับผล drill-down เสมอ
  const lived    = rows.filter(CARD_FILTERS.lived.test).length;
  const transit  = rows.filter(CARD_FILTERS.transit.test).length;
  const contract = rows.filter(CARD_FILTERS.contract.test).length;
  const waiting  = rows.filter(CARD_FILTERS.waiting.test).length;
  const paid     = rows.filter(CARD_FILTERS.paid.test).length;

  document.getElementById('stat-total').textContent    = total;
  document.getElementById('stat-lived').textContent    = lived;
  document.getElementById('stat-transit').textContent  = transit;
  document.getElementById('stat-contract').textContent = contract;
  document.getElementById('stat-waiting').textContent  = waiting;
  document.getElementById('stat-paid').textContent     = paid;

  // Status chart
  const statusCount = {};
  rows.forEach(r => {
    const s = displayStatus(r) || '-';
    statusCount[s] = (statusCount[s]||0) + 1;
  });
  const statusColors = ['blue','green','yellow','red','purple','green','blue'];
  renderBarChart('chart-status', statusCount, total, statusColors);

  // Zone chart
  const zoneCount = {};
  rows.forEach(r => {
    const z = getCell(r,'HEALTH_ZONE');
    if (z) zoneCount['เขต '+z] = (zoneCount['เขต '+z]||0) + 1;
  });
  const topZones = Object.entries(zoneCount).sort((a,b)=>b[1]-a[1]).slice(0,7);
  renderBarChart('chart-zone', Object.fromEntries(topZones), Math.max(...topZones.map(e=>e[1])), ['blue']);

  // PACS chart
  const pacsCount = {};
  rows.forEach(r => {
    const p = getCell(r,'PACS');
    if (p) pacsCount[p] = (pacsCount[p]||0) + 1;
  });
  const topPacs = Object.entries(pacsCount).sort((a,b)=>b[1]-a[1]).slice(0,8);
  renderBarChart('chart-pacs', Object.fromEntries(topPacs), Math.max(...topPacs.map(e=>e[1])), ['purple','blue','green','yellow','red']);

  // Phase chart
  const phaseCount = {};
  rows.forEach(r => {
    const p = getCell(r,'PHASE') || '-';
    phaseCount['Phase '+p] = (phaseCount['Phase '+p]||0) + 1;
  });
  renderBarChart('chart-phase', phaseCount, total, ['blue','green','yellow','red']);
}

function renderBarChart(containerId, data, maxVal, colors = ['blue']) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';
  const entries = Object.entries(data);
  entries.forEach(([label, val], i) => {
    const pct = maxVal > 0 ? Math.round((val / maxVal) * 100) : 0;
    const color = colors[i % colors.length];
    container.innerHTML += `
      <div class="bar-row">
        <div class="bar-label" title="${esc(label)}">${esc(label)}</div>
        <div class="bar-track"><div class="bar-fill ${color}" style="width:${pct}%"></div></div>
        <div class="bar-val">${val}</div>
      </div>`;
  });
}

// ════════════════════════════════════════════
// HOSPITALS TABLE
// ════════════════════════════════════════════
function applyFilters() {
  const search  = (document.getElementById('search-input')?.value || '').toLowerCase();
  const phase   = document.getElementById('filter-phase')?.value || '';
  const status  = document.getElementById('filter-status')?.value || '';
  const zone    = document.getElementById('filter-zone')?.value || '';
  const sales   = document.getElementById('filter-sales')?.value || '';

  STATE.filtered = STATE.rows.filter(row => {
    const hosp  = getCell(row,'HOSPITAL').toLowerCase();
    const prov  = getCell(row,'PROVINCE').toLowerCase();
    const hcode = getCell(row,'HCODE').toLowerCase();
    const p     = String(getCell(row,'PHASE'));
    const s     = displayStatus(row);
    const z     = String(getCell(row,'HEALTH_ZONE'));
    const sl    = getCell(row,'SALES');

    if (search && !hosp.includes(search) && !prov.includes(search) && !hcode.includes(search)) return false;
    if (phase  && p !== phase)   return false;
    if (status && s !== status)  return false;
    if (zone   && z !== zone)    return false;
    if (sales  && sl !== sales)  return false;
    if (STATE.cardFilter && !CARD_FILTERS[STATE.cardFilter].test(row)) return false;
    return true;
  });

  // sort
  if (STATE.sortCol) {
    const colMap = {
      phase: 'PHASE', hospital: 'HOSPITAL', level: 'LEVEL',
      province: 'PROVINCE', zone: 'HEALTH_ZONE', pacs: 'PACS',
      status: 'STATUS', golive: 'GOLIVE', paid: 'PAID',
    };
    const key = colMap[STATE.sortCol];
    STATE.filtered.sort((a,b) => {
      const va = String(getCell(a, key)).trim();
      const vb = String(getCell(b, key)).trim();
      if (!va && !vb) return 0;
      if (!va) return 1;    // ค่าว่างไปท้ายเสมอ ไม่ว่าเรียงทิศไหน
      if (!vb) return -1;
      const cmp = smartCompare(va, vb);
      return STATE.sortDir === 'asc' ? cmp : -cmp;
    });
  }

  STATE.page = 1;
  renderTable();
}

function renderTable() {
  const tbody    = document.getElementById('table-body');
  const start    = (STATE.page - 1) * STATE.pageSize;
  const end      = Math.min(start + STATE.pageSize, STATE.filtered.length);
  const pageRows = STATE.filtered.slice(start, end);

  if (pageRows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10"><div class="empty-state"><div class="icon">🔍</div><p>ไม่พบข้อมูล</p></div></td></tr>`;
  } else {
    tbody.innerHTML = pageRows.map((row, i) => {
      const absIdx = STATE.rows.indexOf(row);
      return `
        <tr>
          <td>${esc(getCell(row,'PHASE')) || '-'}</td>
          <td class="hospital-name">${esc(getCell(row,'HOSPITAL')) || '-'}</td>
          <td>${esc(getCell(row,'LEVEL')) || '-'}</td>
          <td class="province">${esc(getCell(row,'PROVINCE')) || '-'}</td>
          <td>${esc(getCell(row,'HEALTH_ZONE')) || '-'}</td>
          <td>${esc(getCell(row,'PACS')) || '-'}</td>
          <td>${statusBadge(displayStatus(row))}</td>
          <td>${esc(getCell(row,'GOLIVE')) || '-'}</td>
          <td>${boolIcon(getCell(row,'PAID'))}</td>
          <td>
            <div class="action-btns">
              <button class="icon-btn" onclick="openDetail(${absIdx})" title="ดูรายละเอียด">👁</button>
              <button class="icon-btn edit" onclick="openEditModal(${absIdx})" title="แก้ไข">✏️</button>
            </div>
          </td>
        </tr>`;
    }).join('');
  }

  document.getElementById('table-info').textContent =
    `แสดง ${start+1}–${end} จาก ${STATE.filtered.length} รายการ (ทั้งหมด ${STATE.rows.length})`;

  renderPagination();
}

function renderPagination() {
  const total  = Math.ceil(STATE.filtered.length / STATE.pageSize);
  const pg     = document.getElementById('pagination');
  if (!pg) return;
  pg.innerHTML = '';

  if (total <= 1) return;

  const mkBtn = (label, page, active, disabled) => {
    const btn = document.createElement('button');
    btn.className = 'page-btn' + (active?' active':'');
    btn.textContent = label;
    if (disabled) btn.disabled = true;
    btn.onclick = () => { STATE.page = page; renderTable(); };
    return btn;
  };

  pg.appendChild(mkBtn('‹', STATE.page - 1, false, STATE.page === 1));

  const range = 2;
  for (let p = 1; p <= total; p++) {
    if (p === 1 || p === total || (p >= STATE.page - range && p <= STATE.page + range)) {
      pg.appendChild(mkBtn(p, p, p === STATE.page, false));
    } else if (p === STATE.page - range - 1 || p === STATE.page + range + 1) {
      const span = document.createElement('span');
      span.textContent = '…';
      span.style.cssText = 'padding:0 4px;color:var(--gray-400)';
      pg.appendChild(span);
    }
  }

  pg.appendChild(mkBtn('›', STATE.page + 1, false, STATE.page === total));
}

// ─── Sort headers ──────────────────────────────────────────
document.querySelectorAll('th[data-col]').forEach(th => {
  th.addEventListener('click', () => {
    const col = th.dataset.col;
    if (STATE.sortCol === col) {
      STATE.sortDir = STATE.sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      STATE.sortCol = col;
      STATE.sortDir = 'asc';
    }
    document.querySelectorAll('th[data-col]').forEach(t => {
      t.classList.remove('sorted-asc', 'sorted-desc');
    });
    th.classList.add(`sorted-${STATE.sortDir}`);
    applyFilters();
  });
});

// ─── Filter events ─────────────────────────────────────────
['search-input','filter-phase','filter-status','filter-zone','filter-sales'].forEach(id => {
  document.getElementById(id)?.addEventListener('input', applyFilters);
  document.getElementById(id)?.addEventListener('change', applyFilters);
});

// ════════════════════════════════════════════
// DOC TRACKING TABLE
// ════════════════════════════════════════════
function renderTrackingTable() {
  const search = (document.getElementById('track-search')?.value || '').toLowerCase();
  const phase  = document.getElementById('track-filter-phase')?.value || '';

  const rows = STATE.rows.filter(row => {
    const hosp = getCell(row,'HOSPITAL').toLowerCase();
    const p    = String(getCell(row,'PHASE'));
    if (search && !hosp.includes(search)) return false;
    if (phase  && p !== phase) return false;
    return true;
  });

  const tbody = document.getElementById('track-body');
  if (!tbody) return;

  if (rows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><div class="icon">📄</div><p>ไม่พบข้อมูล</p></div></td></tr>`;
  } else {
    tbody.innerHTML = rows.map(row => `
      <tr>
        <td>${esc(getCell(row,'PHASE')) || '-'}</td>
        <td class="hospital-name">${esc(getCell(row,'HOSPITAL')) || '-'}</td>
        <td>${esc(getCell(row,'PROVINCE')) || '-'}</td>
        <td>${esc(getCell(row,'SALES')) || '-'}</td>
        <td>${boolIcon(getCell(row,'SALES_DOC'))}</td>
        <td>${boolIcon(getCell(row,'CONTRACT_DOC'))}</td>
        <td>${boolIcon(getCell(row,'PAID'))}</td>
        <td>${boolIcon(getCell(row,'DELIVERY_ACK'))}</td>
      </tr>`).join('');
  }

  document.getElementById('track-info').textContent = `แสดง ${rows.length} รายการ`;
}

['track-search','track-filter-phase'].forEach(id => {
  document.getElementById(id)?.addEventListener('input', renderTrackingTable);
  document.getElementById(id)?.addEventListener('change', renderTrackingTable);
});

// ════════════════════════════════════════════
// MODAL - ADD / EDIT
// ════════════════════════════════════════════
function buildForm(data = {}) {
  return `
    <div class="form-grid">
      <div class="form-section">ข้อมูลพื้นฐาน</div>

      <div class="form-group">
        <label>Phase</label>
        <select class="form-control" name="PHASE">
          ${CONFIG.PHASE_OPTIONS.map(p => `<option value="${p}" ${data.PHASE==p?'selected':''}>${p}</option>`).join('')}
        </select>
      </div>

      <div class="form-group">
        <label>ลำดับ</label>
        <input class="form-control" name="ORDER" type="number" value="${esc(data.ORDER||'')}" placeholder="เลขลำดับ" />
      </div>

      <div class="form-group full">
        <label>ชื่อหน่วยบริการ *</label>
        <input class="form-control" name="HOSPITAL" required value="${esc(data.HOSPITAL||'')}" placeholder="ชื่อโรงพยาบาล" />
      </div>

      <div class="form-group">
        <label>ประเภท</label>
        <input class="form-control" name="TYPE" value="${esc(data.TYPE||'')}" placeholder="คัดเลือกหลัก / เพิ่มเติม" />
      </div>

      <div class="form-group">
        <label>สังกัด</label>
        <input class="form-control" name="AFFILIATION" value="${esc(data.AFFILIATION||'')}" />
      </div>

      <div class="form-group">
        <label>เขตสุขภาพ</label>
        <input class="form-control" name="HEALTH_ZONE" type="number" value="${esc(data.HEALTH_ZONE||'')}" placeholder="1-13" />
      </div>

      <div class="form-group">
        <label>HCODE</label>
        <input class="form-control" name="HCODE" value="${esc(data.HCODE||'')}" />
      </div>

      <div class="form-group">
        <label>ระดับ</label>
        <select class="form-control" name="LEVEL">
          <option value="">-</option>
          ${CONFIG.LEVEL_OPTIONS.map(l => `<option value="${l}" ${data.LEVEL==l?'selected':''}>${l}</option>`).join('')}
        </select>
      </div>

      <div class="form-group">
        <label>จังหวัด</label>
        <input class="form-control" name="PROVINCE" value="${esc(data.PROVINCE||'')}" />
      </div>

      <div class="form-group">
        <label>PACS</label>
        <input class="form-control" name="PACS" value="${esc(data.PACS||'')}" list="pacs-list" />
        <datalist id="pacs-list">
          ${['JF','OREX','TGL','ThaiGL','Fuji','Philips','Meddream','PACSPLUS','BJC','Atom','Aztec','ABJ'].map(p=>`<option value="${p}">`).join('')}
        </datalist>
      </div>

      <div class="form-group">
        <label>Priority Group</label>
        <input class="form-control" name="PRIORITY" value="${esc(data.PRIORITY||'')}" placeholder="A / B / C" />
      </div>

      <div class="form-section">ผู้รับผิดชอบ</div>

      <div class="form-group">
        <label>Sales</label>
        <input class="form-control" name="SALES" value="${esc(data.SALES||'')}" />
      </div>

      <div class="form-group">
        <label>ผู้ให้ข้อมูล (Contact)</label>
        <input class="form-control" name="CONTACT" value="${esc(data.CONTACT||'')}" />
      </div>

      <div class="form-group">
        <label>เบอร์โทร</label>
        <input class="form-control" name="PHONE" value="${esc(data.PHONE||'')}" />
      </div>

      <div class="form-group">
        <label>Email</label>
        <input class="form-control" name="EMAIL" type="email" value="${esc(data.EMAIL||'')}" />
      </div>

      <div class="form-section">สถานะการดำเนินงาน</div>

      <div class="form-group full">
        <label>Implement Status</label>
        <select class="form-control" name="STATUS">
          ${CONFIG.STATUS_OPTIONS.map(s => `<option value="${s}" ${data.STATUS==s?'selected':''}>${s}</option>`).join('')}
        </select>
      </div>

      <div class="form-group">
        <label>วันที่ส่งเครื่องไป</label>
        <input class="form-control" name="SEND_DATE" type="date" value="${esc(data.SEND_DATE||'')}" />
      </div>

      <div class="form-group">
        <label>Golive Date</label>
        <input class="form-control" name="GOLIVE" type="date" value="${esc(data.GOLIVE||'')}" />
      </div>

      <div class="form-group">
        <label>วันที่เริ่มสัญญา</label>
        <input class="form-control" name="CONTRACT_START" type="date" value="${esc(data.CONTRACT_START||'')}" />
      </div>

      <div class="form-group">
        <label>วันที่สิ้นสุดสัญญา</label>
        <input class="form-control" name="CONTRACT_END" type="date" value="${esc(data.CONTRACT_END||'')}" />
      </div>

      <div class="form-section">เอกสาร</div>

      <div class="form-group">
        <div class="checkbox-group">
          <input type="checkbox" name="SALES_DOC" id="chk-sales-doc" ${data.SALES_DOC===true||data.SALES_DOC==='TRUE'?'checked':''} />
          <label for="chk-sales-doc">Sales Doc</label>
        </div>
      </div>

      <div class="form-group">
        <div class="checkbox-group">
          <input type="checkbox" name="CONTRACT_DOC" id="chk-contract-doc" ${data.CONTRACT_DOC===true||data.CONTRACT_DOC==='TRUE'?'checked':''} />
          <label for="chk-contract-doc">Contract Doc</label>
        </div>
      </div>

      <div class="form-group">
        <div class="checkbox-group">
          <input type="checkbox" name="PAID" id="chk-paid" ${data.PAID===true||data.PAID==='TRUE'?'checked':''} />
          <label for="chk-paid">Paid?</label>
        </div>
      </div>

      <div class="form-group">
        <div class="checkbox-group">
          <input type="checkbox" name="DELIVERY_ACK" id="chk-delivery" ${data.DELIVERY_ACK===true||data.DELIVERY_ACK==='TRUE'?'checked':''} />
          <label for="chk-delivery">ได้ใบตอบรับการส่งมอบ</label>
        </div>
      </div>
    </div>`;
}

function getFormData(form) {
  const data = {};
  new FormData(form).forEach((val, key) => { data[key] = val; });
  // checkboxes (unchecked don't appear in FormData)
  ['SALES_DOC','CONTRACT_DOC','PAID','DELIVERY_ACK'].forEach(k => {
    data[k] = form.querySelector(`[name="${k}"]`)?.checked ? 'TRUE' : 'FALSE';
  });
  return data;
}

function rowFromFormData(data, baseRow = null) {
  // Build array in column order
  // B1: ถ้ามี baseRow (ตอนแก้ไข) เริ่มจากค่าเดิมของแถวนั้น แล้วทับเฉพาะ field ที่ mapping รู้จัก
  // → คอลัมน์ที่อยู่นอก CONFIG.COLUMNS (เช่น note ที่เพิ่มทีหลัง / header สะกดไม่ตรง) ไม่ถูกล้าง
  const row = new Array(STATE.headers.length).fill('');
  if (baseRow) baseRow.forEach((v, i) => { if (i < row.length) row[i] = v ?? ''; });
  Object.entries(COL).forEach(([key, idx]) => {
    if (data[key] !== undefined) row[idx] = data[key];
  });
  return row;
}

// ─── B2: หาแถวจริงใน Sheet ก่อนเซฟ ─────────────────────────
// index ที่จำไว้ตอนโหลดอาจเพี้ยน ถ้ามีคน แทรก/ลบ/เรียง แถวใน Sheet ระหว่างเปิดแอปค้างไว้
// → โหลดข้อมูลสดแล้วหาแถวเดิมด้วย HCODE → ชื่อหน่วยบริการ → เทียบเนื้อหาทั้งแถว
function locateRow(rows, original) {
  const findUnique = (key) => {
    const val = String(getCell(original, key)).trim();
    if (!val) return -1;
    const hits = [];
    rows.forEach((r, i) => { if (String(getCell(r, key)).trim() === val) hits.push(i); });
    return hits.length === 1 ? hits[0] : -1;   // ต้อง unique เท่านั้น กันจับผิดแถว
  };
  let at = findUnique('HCODE');
  if (at === -1) at = findUnique('HOSPITAL');
  if (at === -1) {
    const sig = JSON.stringify(original);
    at = rows.findIndex(r => JSON.stringify(r) === sig);
  }
  return at;
}

async function relocateEditRow(localIndex) {
  const original = STATE.rows[localIndex];
  const fresh = await sheetsGet(`${CONFIG.SHEET_NAME}!A1:X2000`);
  const all = fresh.values || [];
  if (JSON.stringify(all[0] || []) !== JSON.stringify(STATE.headers)) {
    throw new Error('โครงสร้างคอลัมน์ใน Sheet เปลี่ยนไป — กดรีเฟรชแล้วลองใหม่');
  }
  const rows = all.slice(1);
  const at = locateRow(rows, original);
  if (at === -1) {
    throw new Error('ไม่พบแถวเดิมใน Sheet (อาจถูกลบ/แก้ไขจากที่อื่น) — กดรีเฟรชแล้วลองใหม่');
  }
  return { rows, at };
}

function openAddModal() {
  STATE.editRowIndex = null;
  document.getElementById('modal-title').textContent = '➕ เพิ่มรายการโรงพยาบาล';
  document.getElementById('modal-body').innerHTML = `<form id="edit-form">${buildForm()}</form>`;
  document.getElementById('modal-overlay').classList.remove('hidden');
}

function openEditModal(absIdx) {
  STATE.editRowIndex = absIdx;
  const row  = STATE.rows[absIdx];

  // Build data object from row
  const data = {};
  Object.entries(COL).forEach(([key, idx]) => { data[key] = row[idx] ?? ''; });

  document.getElementById('modal-title').textContent = '✏️ แก้ไขรายการ';
  document.getElementById('modal-body').innerHTML = `<form id="edit-form">${buildForm(data)}</form>`;
  document.getElementById('modal-overlay').classList.remove('hidden');
}

async function saveModal() {
  const form = document.getElementById('edit-form');
  if (!form.checkValidity()) { form.reportValidity(); return; }

  const data = getFormData(form);

  const saveBtn = document.getElementById('modal-save');
  saveBtn.disabled = true;
  saveBtn.textContent = '⏳ กำลังบันทึก...';

  try {
    if (STATE.editRowIndex === null) {
      // Append new row (row index = headers + rows.length + 1)
      const rowArr = rowFromFormData(data);
      await sheetsAppend(`${CONFIG.SHEET_NAME}!A:X`, [rowArr]);
      STATE.rows.push(rowArr);
      toast('เพิ่มรายการสำเร็จ ✅', 'success');
    } else {
      // B2: หาแถวจริงจากข้อมูลสดก่อนเซฟ (ไม่ยึด index ตอนโหลด)
      const { rows: freshRows, at } = await relocateEditRow(STATE.editRowIndex);
      // B1: ใช้แถวสดเป็นฐาน → คอลัมน์นอก mapping คงค่าเดิมไว้
      const rowArr = rowFromFormData(data, freshRows[at]);
      const sheetRow = at + 2;   // +2 เพราะ header คือแถว 1
      await sheetsUpdate(`${CONFIG.SHEET_NAME}!A${sheetRow}:X${sheetRow}`, [rowArr]);
      // sync local state ให้ตรงกับ Sheet ล่าสุดทั้งชุด
      freshRows[at] = rowArr;
      STATE.rows = freshRows;
      toast('บันทึกการแก้ไขสำเร็จ ✅', 'success');
    }
    closeModal();
    applyFilters();
    renderDashboard();
    renderTrackingTable();
  } catch (e) {
    toast('บันทึกล้มเหลว: ' + e.message, 'error');
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = '💾 บันทึก';
  }
}

function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
}

// ════════════════════════════════════════════
// DETAIL VIEW
// ════════════════════════════════════════════
function openDetail(absIdx) {
  const row  = STATE.rows[absIdx];
  STATE.detailRow = absIdx;

  document.getElementById('detail-title').textContent = getCell(row,'HOSPITAL') || 'รายละเอียด';

  const d = (key, label) => {
    const val = esc(getCell(row, key)) || '-';
    return `<div class="detail-item"><div class="detail-label">${label}</div><div class="detail-value">${val}</div></div>`;
  };
  const db = (key, label) => {
    const val = getCell(row, key);
    return `<div class="detail-item"><div class="detail-label">${label}</div><div class="detail-value">${boolIcon(val)}</div></div>`;
  };

  document.getElementById('detail-body').innerHTML = `
    <div class="detail-grid">
      <div class="detail-section">ข้อมูลทั่วไป</div>
      ${d('PHASE','Phase')} ${d('ORDER','ลำดับ')}
      ${d('TYPE','ประเภท')} ${d('AFFILIATION','สังกัด')}
      ${d('HCODE','HCODE')} ${d('LEVEL','ระดับ')}
      ${d('PROVINCE','จังหวัด')} ${d('HEALTH_ZONE','เขตสุขภาพ')}
      ${d('PACS','PACS')} ${d('PRIORITY','Priority Group')}

      <div class="detail-section">ผู้รับผิดชอบ</div>
      ${d('SALES','Sales')} ${d('CONTACT','ผู้ให้ข้อมูล')}
      ${d('PHONE','เบอร์โทร')} ${d('EMAIL','Email')}

      <div class="detail-section">สถานะ</div>
      <div class="detail-item" style="grid-column:1/-1">
        <div class="detail-label">Implement Status</div>
        <div class="detail-value">${statusBadge(displayStatus(row))}</div>
      </div>
      ${d('SEND_DATE','วันที่ส่งเครื่อง')} ${d('GOLIVE','Golive Date')}
      ${d('CONTRACT_START','เริ่มสัญญา')} ${d('CONTRACT_END','สิ้นสุดสัญญา')}

      <div class="detail-section">เอกสาร</div>
      ${db('SALES_DOC','Sales Doc')} ${db('CONTRACT_DOC','Contract Doc')}
      ${db('PAID','Paid?')} ${db('DELIVERY_ACK','ได้ใบตอบรับ')}
    </div>`;

  document.getElementById('detail-overlay').classList.remove('hidden');
}

function closeDetail() {
  document.getElementById('detail-overlay').classList.add('hidden');
}

// ════════════════════════════════════════════
// NAVIGATION
// ════════════════════════════════════════════
const PAGE_META = {
  dashboard: { title: 'Dashboard', breadcrumb: 'NHSO / Dashboard' },
  hospitals:  { title: 'รายการโรงพยาบาล', breadcrumb: 'NHSO / รายการโรงพยาบาล' },
  tracking:   { title: 'Doc Tracking', breadcrumb: 'NHSO / Doc Tracking' },
  add:        { title: 'เพิ่มรายการใหม่', breadcrumb: 'NHSO / เพิ่มรายการ' },
};

function navigateTo(pageName, pushHistory = true) {
  // ป้องกัน Viewer เข้าหน้าที่ไม่มีสิทธิ์
  if (isViewer() && ['hospitals', 'tracking', 'add'].includes(pageName)) {
    toast('⚠️ ไม่มีสิทธิ์เข้าถึงหน้านี้', 'warning');
    return;
  }

  document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
  document.getElementById(`page-${pageName}`)?.classList.remove('hidden');
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.querySelector(`.nav-item[data-page="${pageName}"]`)?.classList.add('active');

  const meta = PAGE_META[pageName] || {};
  document.getElementById('page-title').textContent = meta.title || pageName;
  document.getElementById('page-breadcrumb').textContent = meta.breadcrumb || '';

  // บันทึกลง browser history → ปุ่ม Back/Forward ใช้งานได้
  if (pushHistory) history.pushState({ page: pageName }, '', '#' + pageName);

  if (pageName === 'add') {
    document.getElementById('add-form-container').innerHTML = `
      <div class="modal-body" style="padding:0">
        <form id="add-form-inline">${buildForm()}</form>
      </div>
      <div style="padding:20px;display:flex;justify-content:flex-end;gap:10px;border-top:1px solid var(--gray-200)">
        <button class="btn btn-outline" onclick="navigateTo('hospitals')">ยกเลิก</button>
        <button class="btn btn-primary" id="add-save-btn">💾 บันทึก</button>
      </div>`;

    document.getElementById('add-save-btn').addEventListener('click', async () => {
      const form = document.getElementById('add-form-inline');
      if (!form.checkValidity()) { form.reportValidity(); return; }
      const data   = getFormData(form);
      const rowArr = rowFromFormData(data);
      const btn = document.getElementById('add-save-btn');
      btn.disabled = true; btn.textContent = '⏳...';
      try {
        await sheetsAppend(`${CONFIG.SHEET_NAME}!A:X`, [rowArr]);
        STATE.rows.push(rowArr);
        toast('เพิ่มรายการสำเร็จ ✅', 'success');
        applyFilters();
        renderDashboard();
        navigateTo('hospitals');
      } catch(e) {
        toast('บันทึกล้มเหลว: ' + e.message, 'error');
      } finally {
        btn.disabled = false; btn.textContent = '💾 บันทึก';
      }
    });
  }
}

// nav clicks
document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', () => navigateTo(item.dataset.page));
});

// browser Back/Forward → สลับหน้าในแอป (ไม่ push ซ้ำ)
window.addEventListener('popstate', e => {
  navigateTo(e.state?.page || 'dashboard', false);
});

// ─── Buttons ───────────────────────────────────────────────
document.getElementById('btn-add-row')?.addEventListener('click', openAddModal);
document.getElementById('btn-refresh')?.addEventListener('click', loadSheetData);
document.getElementById('btn-logout')?.addEventListener('click', handleLogout);
document.getElementById('modal-close')?.addEventListener('click', closeModal);
document.getElementById('modal-cancel')?.addEventListener('click', closeModal);
document.getElementById('modal-save')?.addEventListener('click', saveModal);
document.getElementById('detail-close')?.addEventListener('click', closeDetail);
document.getElementById('detail-close-btn')?.addEventListener('click', closeDetail);
document.getElementById('detail-edit-btn')?.addEventListener('click', () => {
  closeDetail();
  if (STATE.detailRow !== null) openEditModal(STATE.detailRow);
});

// Close modal on backdrop click
document.getElementById('modal-overlay')?.addEventListener('click', e => {
  if (e.target === document.getElementById('modal-overlay')) closeModal();
});
document.getElementById('detail-overlay')?.addEventListener('click', e => {
  if (e.target === document.getElementById('detail-overlay')) closeDetail();
});

// ════════════════════════════════════════════
// INIT
// ════════════════════════════════════════════
window.addEventListener('DOMContentLoaded', () => {
  initAuth();
});

// Expose functions needed by inline onclick
window.openDetail      = openDetail;
window.openEditModal   = openEditModal;
window.drillCard       = drillCard;
window.clearCardFilter = clearCardFilter;
