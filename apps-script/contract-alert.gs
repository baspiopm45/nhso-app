/**
 * NHSO Contract Alert — email เตือนสัญญาหมด/ใกล้หมด อัตโนมัติทุกสัปดาห์
 * ใช้ logic เดียวกับ Contract Radar ในแอป (app.js → contractInfo)
 *
 * ── วิธีติดตั้ง (ทำครั้งเดียว ~2 นาที) ──────────────────────────────
 * 1. เปิด Google Sheet "NHSO List_ ALL" → เมนู Extensions → Apps Script
 * 2. ลบโค้ดตัวอย่าง แล้ววางไฟล์นี้ทั้งไฟล์ → กด Save (💾)
 * 3. เลือกฟังก์ชัน `installTrigger` จาก dropdown → กด Run → อนุญาตสิทธิ์ (ครั้งแรกครั้งเดียว)
 *    → จะได้ trigger ส่งอัตโนมัติทุกวันจันทร์ 08:00
 * 4. (ทดสอบทันที) เลือกฟังก์ชัน `contractAlert` → Run → เช็ค email
 *
 * หมายเหตุ: ถ้าไม่มี รพ. หมด/ใกล้หมดเลย สัปดาห์นั้นจะไม่ส่ง email
 */

const CFG = {
  SHEET_NAME: 'Master',
  NEAR_DAYS: 90,                      // "ใกล้หมด" = เหลือ ≤ 90 วัน (ตรงกับแอป)
  ESTIMATE_FROM_GOLIVE: true,         // ไม่มีวันสิ้นสุดจริง → ประมาณการ Golive + 1 ปี − 1 วัน

  // ผู้รับสรุปรวม (internal report — ไม่ใช้ baspiopm45@gmail.com)
  RECIPIENTS: ['ruchasit@perceptra.tech', 'kitti@perceptra.tech', 'chaiwat@perceptra.tech'],

  // ส่งแยกถึงเซลล์เจ้าของ รพ. ด้วยไหม (เปิดเมื่อพร้อม → true)
  SEND_TO_SALES: false,
  // map ชื่อหน้าในคอลัมน์ Sales → email (เทียบจากคำแรกของชื่อ, ไม่สนตัวพิมพ์)
  SALES_EMAILS: {
    'weeraya':   'weeraya@perceptra.tech',
    'irada':     'irada@perceptra.tech',
    'natthapat': 'natthapat@perceptra.tech',
    'araya':     'araya@perceptra.tech',
    'kitti':     'kitti@perceptra.tech',
    'chirut':    'chirut@perceptra.tech',
    'papatsara': 'papatsara@perceptra.tech',
  },

  // ชื่อ header ใน Sheet (ต้องตรงกับ row 1 ของ tab Master)
  COLS: {
    NAME: 'ชื่อหน่วยบริการ', PROVINCE: 'จังหวัด', ZONE: 'เขตสุขภาพ',
    SALES: 'Sales', STATUS: 'Implement Status',
    GOLIVE: 'Golive Date', END: 'วันที่สิ้นสุดสัญญา',
  },
};

function installTrigger() {
  // ลบ trigger เก่าของฟังก์ชันนี้ก่อน กันซ้ำซ้อน
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'contractAlert')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('contractAlert')
    .timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(8)
    .inTimezone('Asia/Bangkok').create();
}

function contractAlert() {
  const sh = SpreadsheetApp.getActive().getSheetByName(CFG.SHEET_NAME);
  if (!sh) throw new Error('ไม่พบ tab ' + CFG.SHEET_NAME);
  const values = sh.getDataRange().getValues();
  const header = values[0].map(h => String(h).trim());
  const col = {};
  Object.entries(CFG.COLS).forEach(([k, name]) => { col[k] = header.indexOf(name); });
  const missing = Object.entries(col).filter(([, i]) => i < 0).map(([k]) => CFG.COLS[k]);
  if (missing.length) throw new Error('ไม่พบคอลัมน์: ' + missing.join(', '));

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const expired = [], near = [];

  values.slice(1).forEach(r => {
    const name = String(r[col.NAME] || '').trim();
    if (!name) return;
    const status = String(r[col.STATUS] || '').trim();
    if (status === 'Waive') return;                       // สละสิทธิ์ ไม่อยู่ใน pipeline

    let end = parseDate_(r[col.END]);
    let estimated = false;
    if (!end && CFG.ESTIMATE_FROM_GOLIVE) {
      const g = parseDate_(r[col.GOLIVE]);
      if (g) {
        end = new Date(g);
        end.setFullYear(end.getFullYear() + 1);
        end.setDate(end.getDate() - 1);
        estimated = true;
      }
    }
    if (!end) return;

    const days = Math.ceil((end.getTime() - today.getTime()) / 86400000);
    const item = {
      name, estimated, days, end,
      province: String(r[col.PROVINCE] || '-'),
      zone: String(r[col.ZONE] || '-'),
      sales: String(r[col.SALES] || '-'),
    };
    if (days < 0) expired.push(item);
    else if (days <= CFG.NEAR_DAYS) near.push(item);
  });

  if (expired.length === 0 && near.length === 0) return;   // สัปดาห์นี้ไม่มีอะไรต้องเตือน
  expired.sort((a, b) => a.end - b.end);
  near.sort((a, b) => a.end - b.end);

  const subject = `📑 NHSO Contract Alert — หมดแล้ว ${expired.length} · ใกล้หมด ${near.length} แห่ง`;
  const html = buildHtml_(expired, near);
  MailApp.sendEmail({ to: CFG.RECIPIENTS.join(','), subject, htmlBody: html });

  if (CFG.SEND_TO_SALES) {
    const bySales = {};
    expired.concat(near).forEach(it => {
      const key = it.sales.trim().split(/\s+/)[0].toLowerCase();
      const email = CFG.SALES_EMAILS[key];
      if (!email) return;
      (bySales[email] = bySales[email] || []).push(it);
    });
    Object.entries(bySales).forEach(([email, items]) => {
      const ex = items.filter(i => i.days < 0), nr = items.filter(i => i.days >= 0);
      MailApp.sendEmail({
        to: email,
        subject: `📑 สัญญาลูกค้าของคุณ — หมดแล้ว ${ex.length} · ใกล้หมด ${nr.length} แห่ง`,
        htmlBody: buildHtml_(ex, nr),
      });
    });
  }
}

function parseDate_(v) {
  if (v instanceof Date && !isNaN(v)) { const d = new Date(v); d.setHours(0, 0, 0, 0); return d; }
  const s = String(v || '').trim();
  if (!s) return null;
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);          // M/D/YYYY (ค่าจาก Sheets)
  if (m) return new Date(+m[3], +m[1] - 1, +m[2]);
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);                      // YYYY-MM-DD
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  return null;
}

function buildHtml_(expired, near) {
  const fmt = d => Utilities.formatDate(d, 'Asia/Bangkok', 'd MMM yyyy');
  const row = (it, color) => `
    <tr>
      <td style="padding:6px 10px;border-bottom:1px solid #eee"><b>${it.name}</b></td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee">${it.province} (เขต ${it.zone})</td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee">${it.sales}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee">${fmt(it.end)}${it.estimated ? ' <span style="color:#3730a3;font-size:11px">(ประมาณการ)</span>' : ''}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right;color:${color};font-weight:bold">
        ${it.days < 0 ? 'เกินมา ' + (-it.days) + ' วัน' : 'อีก ' + it.days + ' วัน'}</td>
    </tr>`;
  const table = (title, items, color) => items.length === 0 ? '' : `
    <h3 style="color:${color};margin:18px 0 6px">${title} (${items.length} แห่ง)</h3>
    <table style="border-collapse:collapse;font-size:13px;width:100%">
      <tr style="background:#f3f4f6;text-align:left">
        <th style="padding:6px 10px">โรงพยาบาล</th><th style="padding:6px 10px">จังหวัด</th>
        <th style="padding:6px 10px">Sales</th><th style="padding:6px 10px">วันหมดสัญญา</th>
        <th style="padding:6px 10px;text-align:right">เหลือเวลา</th></tr>
      ${items.map(it => row(it, color)).join('')}
    </table>`;
  return `
    <div style="font-family:sans-serif;max-width:720px">
      <p>สรุปสถานะสัญญาจากระบบ NHSO AI Tracking — โปรดติดต่อลูกค้าเพื่อดำเนินการต่อสัญญา</p>
      ${table('🔴 หมดสัญญาแล้ว', expired, '#b91c1c')}
      ${table('🟠 ใกล้หมดสัญญา (ภายใน ' + CFG.NEAR_DAYS + ' วัน)', near, '#b45309')}
      <p style="color:#9ca3af;font-size:12px;margin-top:18px">
        "ประมาณการ" = ยังไม่กรอกวันที่สิ้นสุดสัญญาในชีท ระบบคำนวณจาก Golive + 1 ปี −
        กรอกวันที่จริงในคอลัมน์ "วันที่สิ้นสุดสัญญา" เพื่อให้แม่นยำขึ้น ·
        Dashboard: https://baspiopm45.github.io/nhso-app/
      </p>
    </div>`;
}
