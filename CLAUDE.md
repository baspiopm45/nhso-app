# NHSO AI Tracking — Project Context

## Overview
Web app ติดตาม AI Digital X-ray โครงการหลักประกันสุขภาพแห่งชาติ (สปสช.)
Deploy บน GitHub Pages: https://baspiopm45.github.io/nhso-app/
Static app (ไม่มี build step) — HTML/CSS/JS ล้วน + Google Sheets เป็น backend

## Files
| File | Description |
|------|-------------|
| `index.html` | Admin app — full access (ดู/เพิ่ม/แก้ไข) |
| `viewer.html` | Viewer app — read-only, responsive (mobile nav), เชื่อม Viewer Sheet แยก |
| `app.js` | Logic ของ admin (auth, RBAC, Sheets CRUD, dashboard, ตาราง, modal) |
| `config.js` | Shared config (CLIENT_ID, SPREADSHEET_ID, roles, column mapping) |
| `style.css` | ธีม admin (Medical Blue) — viewer มี CSS inline ของตัวเอง (ธีม cream/copper) |

## config.js Key Values
```js
CLIENT_ID: '986692337910-cv8lvufhi9hp3iqu3dg41l2onmopkkkr.apps.googleusercontent.com'
SPREADSHEET_ID: '1BJD_P-aaRNlnqBKUExZwH-uUl_4aITFvag0QlyudSmw'  // Main sheet (admin)
ADMIN_DOMAIN: 'perceptra.tech'
VIEWER_EMAILS: ['nongkoi.nhso@gmail.com', 'baspiopm45@gmail.com', 'jeabpharmacy@gmail.com']
SHEET_NAME: 'Master'
```
⚠️ VIEWER_EMAILS ต้องมี 3 คนนี้เสมอ — เคยมีไฟล์ local เวอร์ชันเก่าที่เหลือ 1 คน ห้าม push ทับ

## Google Sheets
- **Main Sheet** (admin): `1BJD_P-aaRNlnqBKUExZwH-uUl_4aITFvag0QlyudSmw` — Sheet "Master"
- **Viewer Sheet**: `1HPCG5Vq4PlPPdHix42KiyGz6M4Cs-5PPBQoX8VuUzro` — Sheet "Sheet1"
  - สร้างจาก IMPORTRANGE ของ Main Sheet, ซ่อนคอลัมน์ J, K, L (PACS, Priority Group, Sales)
  - Formula: `={IMPORTRANGE("main_url","Master!A:I"),IMPORTRANGE("main_url","Master!M:X")}`
  - Shared: "Anyone with the link" = Viewer ⚠️ (ควรพิจารณาเปลี่ยนเป็นแชร์รายบุคคล — R1)

## Auth / Access Control
- Google OAuth 2.0 via Google Identity Services (GIS), scope: spreadsheets (admin) / spreadsheets.readonly (viewer)
- **Admin**: email ลงท้าย `@perceptra.tech` → full access (index.html)
- **Viewer**: email อยู่ใน VIEWER_EMAILS → read-only (viewer.html)
- Token หมดอายุ ~1 ชม. → `sheetsFetch()` ใน app.js จับ 401 แล้ว refresh เงียบๆ + retry อัตโนมัติ
- OAuth App ยังอยู่ **Testing mode** → เพิ่ม user ใหม่ต้อง add Test User ใน Google Cloud Console ทุกครั้ง
  (APIs & Services → OAuth consent screen → Test users)
- ⚠️ RBAC ใน JS เป็นแค่การซ่อน UI — สิทธิ์จริงอยู่ที่ Sheet sharing

## Status Classification (นิยามกลาง — admin/viewer ตรงกัน)
```
Golive แล้ว    = STATUS ขึ้นต้นด้วย "Lived" (รวม "Lived and Re-Check…")
กำลังดำเนินการ  = Machine in Transit / In process config network with IT / Ready for Training
ทำสัญญา        = STATUS ว่างหรือ '-' แต่ Sales Doc = TRUE → derive เป็น "Contract in progress"
รอดำเนินการ    = Waiting PACS / Waiting Swaping / Ready for Sending / '-' / ว่าง (ไม่รวมทำสัญญา)
```
- นิยามอยู่ที่ `CARD_FILTERS` (app.js) และ `V_CARDS` (viewer.html) — **ต้องแก้ให้ตรงกันทั้งคู่เสมอ** (R2: ควรย้ายรวมไป config.js)
- "Contract in progress" เป็น derived status ตอนแสดงผล (`displayStatus`/`vcDisplayStatus`) — ไม่เขียนลง Sheet
- ผลรวม 4 กลุ่มต้อง = จำนวนแถวทั้งหมดเสมอ (มี partition test ยืนยันแล้ว)
- ⚠️ R3: สถานะใหม่ที่ไม่เข้ากลุ่มไหนเลย (ไม่ใช่ตระกูล Lived) จะหลุดจากทุกการ์ดอีก — ถ้าทีมเพิ่มสถานะใหม่ต้องจัดกลุ่มในโค้ดด้วย

## Features (สถานะล่าสุด)
- **Dashboard**: stat cards **คลิกได้ทุกใบ** → drill-down ไปหน้า รายการ รพ. พร้อม filter + แถบบอก/ปุ่มล้าง
  - Admin 6 การ์ด: ทั้งหมด / Golive / กำลังดำเนินการ / อยู่ระหว่างทำสัญญา / รอดำเนินการ / ชำระแล้ว
  - Viewer 5 การ์ด (ไม่มีชำระแล้ว) + progress ring + zone chart คลิกได้ (drillZone)
- **Browser Back/Forward ใช้งานได้** — navigateTo ใช้ history.pushState + #hash, หน้าเดิมไม่ push ซ้ำ
- **ตัวกรองสถานะสร้างจากข้อมูลจริง** ทั้ง 2 แอป (สถานะใหม่โผล่อัตโนมัติ), เขต/Sales เติมแบบล้างก่อน (กด รีเฟรช ไม่งอกซ้ำ)
- **Sort ฉลาด** (`smartCompare`): ตัวเลขเทียบเป็นตัวเลข (เขต 2 < 10), วันที่ M/D/YYYY เทียบตามเวลา, ไทยเรียง locale
- **ทุกค่าจาก Sheet ผ่าน `esc()`** ก่อนลง innerHTML/value — กัน HTML injection และอักขระพิเศษพังฟอร์ม

## การเซฟข้อมูล (สำคัญ — กัน data loss)
- **ห้ามเซฟด้วย index ตอนโหลด** — `saveModal` ใช้ `relocateEditRow()`: โหลด Sheet สดก่อนเซฟ
  แล้วหาแถวเดิมด้วย HCODE (unique) → ชื่อ รพ. → เทียบทั้งแถว; หาไม่เจอ = ยกเลิกพร้อมบอกให้รีเฟรช
- **`rowFromFormData(data, baseRow)`** ใช้แถวสดเป็นฐาน ทับเฉพาะ field ใน CONFIG.COLUMNS
  → คอลัมน์นอก mapping ใน Sheet ไม่ถูกล้าง
- Data range ใช้ `A:X` (ไม่จำกัดแถว) ทุกจุด
- Checkbox ตีความด้วย `isTruthy()` (true/yes/1) ให้ตรงกันทั้งแสดงผลและฟอร์ม

## Deploy Workflow
```bash
git clone https://github.com/baspiopm45/nhso-app.git
cd nhso-app
# แก้ไฟล์ → commit → push
git push   # GitHub Pages auto-deploy จาก main (~1 นาที)
```
- ⚠️ GitHub Pages cache 10 นาที (`cache-control: max-age=600`) — ทดสอบหลัง deploy ต้อง **hard refresh (Cmd+Shift+R)**
- โฟลเดอร์งาน local: `~/Desktop/perceptra/Claude code project/mnt/outputs/nhso-app/` — แก้ที่นี่แล้ว copy เข้า clone ก่อน push
  **ก่อน push ให้ diff เทียบ repo เสมอ** (เคยเกือบ revert ของที่ deploy แล้ว 2 ครั้ง: VIEWER_EMAILS, viewer status logic)

## ประวัติสำคัญ
- 2026-06-02: sync viewer status logic ให้ตรง admin (array-based)
- 2026-07-04: Contract in progress (derived status) + การ์ดใหม่ 2 แอป + การ์ดคลิกได้ + history nav
- 2026-07-05: code review B1–B12 แก้ครบ — data-loss ตอนเซฟ (B1/B2), Lived and Re-Check นับเป็น Golive (B3),
  filter dedup/esc/smart sort/drill paging (B4–B7), token refresh/unbounded rows/dynamic filter/checkbox/history dedup (B8–B12)

## Open Items
- [ ] R1: เปลี่ยน Viewer Sheet จาก "anyone with link" เป็นแชร์รายบุคคล (ทำใน Google Sheets)
- [ ] R2: ย้ายนิยามกลุ่มสถานะ (CARD_FILTERS/V_CARDS) ไปรวมที่ config.js ที่เดียว
- [ ] R3: bucket "อื่นๆ" สำหรับสถานะใหม่ที่ไม่เข้ากลุ่มไหน + ตัวเตือนบน dashboard

## Design System
- Admin (`style.css`): Medical Blue — `--primary: #1a56db`, badge `.badge-contract` = indigo
- Viewer (inline CSS): warm cream `--bg: #F5F0E8`, dark sidebar `#1C1917`, copper accent `#CC785C`
