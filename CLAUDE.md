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
กำลังดำเนินการ  = In Transit / Config network / Ready Training / Wait PACS / Ready Sending
ทำสัญญา        = STATUS ว่างหรือ '-' แต่ Sales Doc active → derive "Contract in progress"
รอดำเนินการ    = Waiting Swaping / '-' / ว่าง (ไม่รวมทำสัญญา)
สละสิทธิ์       = STATUS ใน WAIVED (เช่น "Waive") — กลุ่มแยก คงในฐานรวม การ์ดโชว์เมื่อมี
```
**Sales Doc เป็นข้อความ 3 ค่า** (Completed / In progress / Not started — XLOOKUP จาก tab "Doc tracking")
- ค่าที่นับว่า active อยู่ใน `STATUS_GROUPS.SALES_DOC_ACTIVE` (รวม TRUE เดิมช่วง migrate)
- ⚠️ **คอลัมน์ Sales Doc เป็นสูตร — แอปห้ามเขียนทับ**: `CONFIG.FORMULA_COLUMNS` + `sheetsUpdateRow()`
  เซฟแบบ batchUpdate เว้นคอลัมน์สูตร, ฟอร์มแก้ไขแสดง Sales Doc แบบ read-only chip
- Pipeline เอกสารเต็ม (tab Doc tracking): ติดต่อผู้ประสานงาน (L) → QT หลัก (M) → Spec บัญชีนวัตกรรม (P)
  → Product Spec (S) [รวม = Sales Doc] → PO/สัญญา (U = Contract Doc) → ออกเช็ค (W = Paid)

## Paid Dashboard + Drill-down
- กล่อง "การชำระเงินรายเขต" ทั้ง 2 แอป: ยังไม่ได้ PO (เทา) / ได้ PO รอเช็ค (เหลือง) / ออกเช็คแล้ว (เขียว)
  ใช้กลุ่ม `paid` / `popending` / `nopo` (มิติการเงิน — คนละ partition กับสถานะติดตั้ง)
- Zone chart (viewer) 5 segments: สละสิทธิ์/รอ/ดำเนินการ/ทำสัญญา/Golive — **คลิกที่ segment ได้**
  → `drillZoneGroup(zone, group)` กรอง เขต+กลุ่ม พร้อมกัน (คลิกชื่อแถว = ทั้งเขต)
- การ์ด Paid ใน viewer คลิกได้
- **นิยามกลางอยู่ที่ `CONFIG.STATUS_GROUPS` ใน config.js ที่เดียว** (R2 ✅) — `CARD_FILTERS` (app.js) และ `V_CARDS` (viewer.html) ดึงจากที่นี่ ห้ามไป hardcode list ในแอปอีก
- "Contract in progress" เป็น derived status ตอนแสดงผล (`displayStatus`/`vcDisplayStatus`) — ไม่เขียนลง Sheet
- **สถานะที่ไม่เข้ากลุ่มไหนเลย → การ์ด "สถานะอื่นๆ" ❓ โชว์อัตโนมัติ** (R3 ✅) — ปกติการ์ดนี้ซ่อน ถ้าโผล่แปลว่าทีมพิมพ์สถานะใหม่ลง Sheet ต้องไปจัดกลุ่มใน STATUS_GROUPS (zone chart ฝั่ง viewer นับสถานะอื่นๆ เข้าแถบเหลือง)
- ผลรวมทุกกลุ่ม (รวมอื่นๆ) ต้อง = จำนวนแถวทั้งหมดเสมอ (มี partition test ยืนยันแล้ว)

## Features (สถานะล่าสุด)
- **Dashboard**: stat cards **คลิกได้ทุกใบ** → drill-down ไปหน้า รายการ รพ. พร้อม filter + แถบบอก/ปุ่มล้าง
  - Admin 6 การ์ด: ทั้งหมด / Golive / กำลังดำเนินการ / อยู่ระหว่างทำสัญญา / รอดำเนินการ / ชำระแล้ว
  - Viewer 5 การ์ด (ไม่มีชำระแล้ว) + progress ring + zone chart คลิกได้ (drillZone)
- **Browser Back/Forward ใช้งานได้** — navigateTo ใช้ history.pushState + #hash, หน้าเดิมไม่ push ซ้ำ
- **ตัวกรองสถานะสร้างจากข้อมูลจริง** ทั้ง 2 แอป (สถานะใหม่โผล่อัตโนมัติ), เขต/Sales เติมแบบล้างก่อน (กด รีเฟรช ไม่งอกซ้ำ)
- **Sort ฉลาด** (`smartCompare`): ตัวเลขเทียบเป็นตัวเลข (เขต 2 < 10), วันที่ M/D/YYYY เทียบตามเวลา, ไทยเรียง locale
- **ทุกค่าจาก Sheet ผ่าน `esc()`** ก่อนลง innerHTML/value — กัน HTML injection และอักขระพิเศษพังฟอร์ม

## Phase B: Doc Step Editor (ติ๊กขั้นเอกสารจากแอป → tab "Doc tracking")
- หน้า Doc Tracking (admin) โชว์ 6 ขั้นเป็นจุดเลข (เขียว=เสร็จ) + chip สรุป → **คลิกแถวเปิด stepper modal** ติ๊กแล้วบันทึก
- โครง tab "Doc tracking": C=ชื่อ รพ. (คีย์ที่ XLOOKUP ใช้) · **J=Progress% (สูตร) · K=สรุป Sales Doc (สูตร) — ห้ามเขียน** ·
  ขั้น checkbox 6 ช่อง: L=ติดต่อผู้ประสานงาน, M=QT หลัก, P=Spec บัญชีนวัตกรรม, S=Product Spec, U=PO/ทำสัญญา, W=ออกเช็ค (spec จากพี่เอ็กซ์ 2026-07-06)
- Flow: ติ๊กในแอป → เขียน TRUE/FALSE **เฉพาะเซลล์ที่เปลี่ยน** (values:batchUpdate) → J/K คำนวณเอง → XLOOKUP เข้า Master!U → ทุกหน้าอัปเดต
- Safety: หาแถวสดด้วยชื่อ รพ. (ต้อง unique) · ยกเลิกถ้าช่องเป้าหมายไม่ใช่ TRUE/FALSE/ว่าง (คอลัมน์เลื่อน) ·
  canary: header L1 ต้องมีคำว่า "ติดต่อ" ไม่งั้นปิดการติ๊กทั้งแอป — config อยู่ที่ `CONFIG.DOC_TRACKING`
- ไม่บังคับลำดับขั้น ไม่ประทับวันที่ (ตามที่บาสเคาะ) · viewer ยังไม่มีฟีเจอร์นี้

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
- 2026-07-05: R2 (STATUS_GROUPS รวมที่ config.js) + R3 (การ์ด "สถานะอื่นๆ" auto-show) ✅
- 2026-07-06: zone chart ซอยย่อย+คลิกได้, Paid dashboard รายเขต, การ์ด Paid viewer, Sales Doc 3 ค่า+กันทับสูตร, กลุ่มสละสิทธิ์ (เอาออกจาก zone chart), **Phase B: doc-step editor ติ๊ก 6 ขั้นเขียนกลับ tab Doc tracking** ✅

## Open Items
- [ ] R1: เปลี่ยน Viewer Sheet จาก "anyone with link" เป็นแชร์รายบุคคล (ทำใน Google Sheets — ต้องแชร์ให้ viewer 3 คน + ทีม @perceptra.tech ให้ครบก่อนปิด link ไม่งั้นเจอ 403)

## Design System
- Admin (`style.css`): Medical Blue — `--primary: #1a56db`, badge `.badge-contract` = indigo
- Viewer (inline CSS): warm cream `--bg: #F5F0E8`, dark sidebar `#1C1917`, copper accent `#CC785C`
