/* ============================================================
   NHSO Web App — app.js
   Google OAuth 2.0 (GIS) + Google Sheets API v4
============================================================ */

// ─── State ────────────────────────────────────────────────
const STATE = {
  user:         null,
  accessToken:  null,
  tokenClient:  null,
  rows:         [],     // raw data from Sheet (array of arrays)
  headers:      [],     // first row = column names
  filtered:     [],     // rows after search/filter
  sortCol:      null,
  sortDir:      'asc',
  page:         1,
  pageSize:     25,
  editRowIndex: null,   // 0-based index in STATE.rows (null = new)
  detailRow:    null,
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
    'Ready for Training':                    'badge-training',
    'Machine in Transit':                    'badge-transit',
    'In process config network with IT':     'badge-process',
    'Waiting for Integrate with PACS':       'badge-waiting',
    'Waiting for Swaping':                   'badge-waiting',
    'Ready for Sending Waiting for address': 'badge-ready',
  };
  const cls = map[status] || 'badge-default';
  const short = {
    'Ready for Training': 'Ready Train',
    'Machine in Transit': 'In Transit',
    'In process config network with IT': 'Config Net',
    'Waiting for Integrate with PACS': 'Wait PACS',
    'Ready for Sending Waiting for address': 'Ready Send',
    'Waiting for Swaping': 'Wait Swap',
  };
  return `<span class="badge ${cls}">${short[status] || status || '-'}</span>`;
}

function boolIcon(val) {
  const v = String(val).toLowerCase();
  if (v === 'true' || v === 'yes' || v === '1') return '<span class="text-green">✔</span>';
  if (v === 'false' || v === 'no' || v === '0') return '<span class="text-red">✗</span>';
  return '<span class="text-gray">-</span>';
}


function determineRole(email) {
  if (!email) return null;
  const em = email.toLowerCase();
  if (em.endsWith('@' + CONFIG.ADMIN_DOMAIN)) return 'admin';
  if (CONFIG.VIEWER_EMAILS.map(e => e.toLowerCase()).includes(em)) return 'viewer';
  return null;
}
function isAdmin() { return STATE.role === 'admin'; }
function isViewer() { return STATE.role === 'viewer'; }
function applyRoleUI() {
  if (isViewer()) {
    ['hospitals','tracking','add'].forEach(p => document.querySelector(`.nav-item[data-page="${p}"]`)?.classList.add('hidden'));
    document.getElementById('card-pacs')?.classList.add('hidden');
    document.getElementById('btn-refresh').classList.add('hidden');
    document.getElementById('sync-text').textContent = '👁 View Only';
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
  STATE.role = determineRole(STATE.user?.email);
  if (!STATE.role) { toast('❌ ไม่มีสิทธิ์เข้าใช้งาน', 'error'); setTimeout(handleLogout, 2500); return; }
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

    // Populate zone filter
    const zones = [...new Set(STATE.rows.map(r => getCell(r, 'HEALTH_ZONE')))].filter(Boolean).sort((a, b) => parseFloat(a) - parseFloat(b));
    const zoneSelect = document.getElementById('filter-zone');
    zones.forEach(z => {
      const opt = document.createElement('option');
      opt.value = z; opt.textContent = `เขต ${z}`;
      zoneSelect.appendChild(opt);
    });

    // Populate sales filter
    const salesList = [...new Set(STATE.rows.map(r => getCell(r, 'SALES')))].filter(Boolean).sort();
    const salesSelect = document.getElementById('filter-sales');
    salesList.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s; opt.textContent = s;
      salesSelect.appendChild(opt);
    });

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
  const total   = rows.length;
  const lived   = rows.filter(r => getCell(r, 'STATUS') === 'Lived').length;
  const transit = rows.filter(r => ['Machine in Transit','In process config network with IT','Ready for Training'].includes(getCell(r,'STATUS'))).length;
  const waiting = rows.filter(r => ['Waiting for Integrate with PACS','Waiting for Swaping','-','Ready for Sending Waiting for address',''].includes(getCell(r,'STATUS'))).length;
  const paid    = rows.filter(r => getCell(r,'PAID').toLowerCase() === 'true').length;

  document.getElementById('stat-total').textContent   = total;
  document.getElementById('stat-lived').textContent   = lived;
  document.getElementById('stat-transit').textContent = transit;
  document.getElementById('stat-waiting').textContent = waiting;
  document.getElementById('stat-paid').textContent    = paid;

  // Status chart
  const statusCount = {};
  rows.forEach(r => {
    const s = getCell(r,'STATUS') || '-';
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
        <div class="bar-label" title="${label}">${label}</div>
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
    const s     = getCell(row,'STATUS');
    const z     = String(getCell(row,'HEALTH_ZONE'));
    const sl    = getCell(row,'SALES');

    if (search && !hosp.includes(search) && !prov.includes(search) && !hcode.includes(search)) return false;
    if (phase  && p !== phase)   return false;
    if (status && s !== status)  return false;
    if (zone   && z !== zone)    return false;
    if (sales  && sl !== sales)  return false;
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
      const va = getCell(a, key);
      const vb = getCell(b, key);
      const cmp = va < vb ? -1 : va > vb ? 1 : 0;
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
          <td>${getCell(row,'PHASE') || '-'}</td>
          <td class="hospital-name">${getCell(row,'HOSPITAL') || '-'}</td>
          <td>${getCell(row,'LEVEL') || '-'}</td>
          <td class="province">${getCell(row,'PROVINCE') || '-'}</td>
          <td>${getCell(row,'HEALTH_ZONE') || '-'}</td>
          <td>${getCell(row,'PACS') || '-'}</td>
          <td>${statusBadge(getCell(row,'STATUS'))}</td>
          <td>${getCell(row,'GOLIVE') || '-'}</td>
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
        <td>${getCell(row,'PHASE') || '-'}</td>
        <td class="hospital-name">${getCell(row,'HOSPITAL') || '-'}</td>
        <td>${getCell(row,'PROVINCE') || '-'}</td>
        <td>${getCell(row,'SALES') || '-'}</td>
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
        <input class="form-control" name="ORDER" type="number" value="${data.ORDER||''}" placeholder="เลขลำดับ" />
      </div>

      <div class="form-group full">
        <label>ชื่อหน่วยบริการ *</label>
        <input class="form-control" name="HOSPITAL" required value="${data.HOSPITAL||''}" placeholder="ชื่อโรงพยาบาล" />
      </div>

      <div class="form-group">
        <label>ประเภท</label>
        <input class="form-control" name="TYPE" value="${data.TYPE||''}" placeholder="คัดเลือกหลัก / เพิ่มเติม" />
      </div>

      <div class="form-group">
        <label>สังกัด</label>
        <input class="form-control" name="AFFILIATION" value="${data.AFFILIATION||''}" />
      </div>

      <div class="form-group">
        <label>เขตสุขภาพ</label>
        <input class="form-control" name="HEALTH_ZONE" type="number" value="${data.HEALTH_ZONE||''}" placeholder="1-13" />
      </div>

      <div class="form-group">
        <label>HCODE</label>
        <input class="form-control" name="HCODE" value="${data.HCODE||''}" />
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
        <input class="form-control" name="PROVINCE" value="${data.PROVINCE||''}" />
      </div>

      <div class="form-group">
        <label>PACS</label>
        <input class="form-control" name="PACS" value="${data.PACS||''}" list="pacs-list" />
        <datalist id="pacs-list">
          ${['JF','OREX','TGL','ThaiGL','Fuji','Philips','Meddream','PACSPLUS','BJC','Atom','Aztec','ABJ'].map(p=>`<option value="${p}">`).join('')}
        </datalist>
      </div>

      <div class="form-group">
        <label>Priority Group</label>
        <input class="form-control" name="PRIORITY" value="${data.PRIORITY||''}" placeholder="A / B / C" />
      </div>

      <div class="form-section">ผู้รับผิดชอบ</div>

      <div class="form-group">
        <label>Sales</label>
        <input class="form-control" name="SALES" value="${data.SALES||''}" />
      </div>

      <div class="form-group">
        <label>ผู้ให้ข้อมูล (Contact)</label>
        <input class="form-control" name="CONTACT" value="${data.CONTACT||''}" />
      </div>

      <div class="form-group">
        <label>เบอร์โทร</label>
        <input class="form-control" name="PHONE" value="${data.PHONE||''}" />
      </div>

      <div class="form-group">
        <label>Email</label>
        <input class="form-control" name="EMAIL" type="email" value="${data.EMAIL||''}" />
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
        <input class="form-control" name="SEND_DATE" type="date" value="${data.SEND_DATE||''}" />
      </div>

      <div class="form-group">
        <label>Golive Date</label>
        <input class="form-control" name="GOLIVE" type="date" value="${data.GOLIVE||''}" />
      </div>

      <div class="form-group">
        <label>วันที่เริ่มสัญญา</label>
        <input class="form-control" name="CONTRACT_START" type="date" value="${data.CONTRACT_START||''}" />
      </div>

      <div class="form-group">
        <label>วันที่สิ้นสุดสัญญา</label>
        <input class="form-control" name="CONTRACT_END" type="date" value="${data.CONTRACT_END||''}" />
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

function rowFromFormData(data) {
  // Build array in column order
  const row = new Array(STATE.headers.length).fill('');
  Object.entries(COL).forEach(([key, idx]) => {
    if (data[key] !== undefined) row[idx] = data[key];
  });
  return row;
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
  const rowArr = rowFromFormData(data);

  const saveBtn = document.getElementById('modal-save');
  saveBtn.disabled = true;
  saveBtn.textContent = '⏳ กำลังบันทึก...';

  try {
    if (STATE.editRowIndex === null) {
      // Append new row (row index = headers + rows.length + 1)
      await sheetsAppend(`${CONFIG.SHEET_NAME}!A:X`, [rowArr]);
      STATE.rows.push(rowArr);
      toast('เพิ่มรายการสำเร็จ ✅', 'success');
    } else {
      // Update existing row (sheet row = index + 2 because header is row 1)
      const sheetRow = STATE.editRowIndex + 2;
      await sheetsUpdate(`${CONFIG.SHEET_NAME}!A${sheetRow}:X${sheetRow}`, [rowArr]);
      STATE.rows[STATE.editRowIndex] = rowArr;
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
    const val = getCell(row, key) || '-';
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
        <div class="detail-value">${statusBadge(getCell(row,'STATUS'))}</div>
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

function navigateTo(pageName) {
  if (isViewer && isViewer() && ['hospitals','tracking','add'].includes(pageName)) { toast('⚠️ ไม่มีสิทธิ์', 'warning'); return; }
  document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
  document.getElementById(`page-${pageName}`)?.classList.remove('hidden');
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.querySelector(`.nav-item[data-page="${pageName}"]`)?.classList.add('active');

  const meta = PAGE_META[pageName] || {};
  document.getElementById('page-title').textContent = meta.title || pageName;
  document.getElementById('page-breadcrumb').textContent = meta.breadcrumb || '';

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
window.openDetail    = openDetail;
window.openEditModal = openEditModal;
