# NHSO AI Tracking — Project Context

## Overview
Web app ติดตาม AI Digital X-ray โครงการหลักประกันสุขภาพแห่งชาติ (สปสช.)
Deploy บน GitHub Pages: https://baspiopm45.github.io/nhso-app/

## Files
| File | Description |
|------|-------------|
| `index.html` | Admin app — full access (edit, add, delete) |
| `viewer.html` | Viewer app — read-only, responsive, เชื่อม Viewer Sheet |
| `config.js` | Shared config (CLIENT_ID, SPREADSHEET_ID, roles, column mapping) |

## config.js Key Values
```js
CLIENT_ID: '986692337910-cv8lvufhi9hp3iqu3dg41l2onmopkkkr.apps.googleusercontent.com'
SPREADSHEET_ID: '1BJD_P-aaRNlnqBKUExZwH-uUl_4aITFvag0QlyudSmw'  // Main sheet (admin)
ADMIN_DOMAIN: 'perceptra.tech'
VIEWER_EMAILS: ['nongkoi.nhso@gmail.com', 'baspiopm45@gmail.com', 'jeabpharmacy@gmail.com']
SHEET_NAME: 'Master'
```

## viewer.html Key Values
```js
VIEWER_SHEET_ID: '1HPCG5Vq4PlPPdHix42KiyGz6M4Cs-5PPBQoX8VuUzro'  // NHSO Viewer Data sheet
VIEWER_SHEET_NAME: 'Sheet1'
```

## Google Sheets
- **Main Sheet** (admin): `1BJD_P-aaRNlnqBKUExZwH-uUl_4aITFvag0QlyudSmw` — Sheet "Master"
- **Viewer Sheet**: `1HPCG5Vq4PlPPdHix42KiyGz6M4Cs-5PPBQoX8VuUzro` — Sheet "Sheet1"
  - สร้างจาก IMPORTRANGE ของ Main Sheet
  - ซ่อนคอลัมน์ J, K, L (PACS, Priority Group, Sales)
  - Formula: `={IMPORTRANGE("main_url","Master!A:I"),IMPORTRANGE("main_url","Master!M:X")}`
  - Shared: "Anyone with the link" = Viewer

## Auth / Access Control
- Google OAuth 2.0 via Google Identity Services (GIS)
- **Admin**: email ลงท้าย `@perceptra.tech` → full access (index.html)
- **Viewer**: email อยู่ใน VIEWER_EMAILS → read-only (viewer.html)
- OAuth App ยังอยู่ใน **Testing mode** → ต้อง add Test Users ใน Google Cloud Console ด้วยทุกครั้งที่เพิ่ม user ใหม่

## Google Cloud Console
- Project มี OAuth 2.0 Client ID สำหรับ Web Application
- Authorized origins: `https://baspiopm45.github.io`
- **Test Users ที่ add แล้ว**: araya, baspiopm45, chaiwat, chirut, irada, kitti, natthapat, nongkoi, paksupa, ruchasit + jeabpharmacy (gmail)
- เมื่อจะ add user ใหม่: Google Cloud Console → APIs & Services → OAuth consent screen → Test users

## viewer.html Features
- **Two-page navigation**: Dashboard + รายการโรงพยาบาล
- **Responsive**: Desktop sidebar + Mobile hamburger menu + Bottom nav
- **Dashboard**: stat cards, progress ring, stacked bar chart รายเขต (คลิกได้), status/phase charts
- **Zone chart**: คลิกที่เขต → drillZone() → ไปหน้า รายการโรงพยาบาล พร้อม filter เขตนั้น
- **รายการโรงพยาบาล**: search, filter (Phase/Status/Zone), pagination (‹ 1 … n ›), eye button ดูรายละเอียด
- **No edit button** — viewer อ่านได้อย่างเดียว

## Status Classification Logic (viewer.html)
```js
isLived    = STATUS === 'Lived'
isProgress = STATUS มีค่า AND !== '-' AND !== 'Lived'
isWaiting  = STATUS ว่าง OR === '-'
```
⚠️ Logic นี้ให้ผล กำลังดำเนินการ=69, รอดำเนินการ=180 ซึ่งต่างจาก admin app (40/209)
→ ต้องตรวจสอบ logic ใน index.html แล้ว sync ให้ตรงกัน

## Column Mapping (CONFIG.COLUMNS)
Main sheet columns ที่สำคัญ:
- PHASE, HOSPITAL (ชื่อหน่วยบริการ), LEVEL (ระดับ), PROVINCE (จังหวัด)
- HEALTH_ZONE (เขตสุขภาพ), STATUS (Implement Status)
- GOLIVE, PAID, SEND_DATE, CONTRACT_START, CONTRACT_END
- HCODE, TYPE, AFFILIATION, DELIVERY_ACK

## Known Issues / TODO
- [ ] Sync status classification logic ระหว่าง viewer.html และ index.html
- [ ] Pagination ของ viewer.html แก้แล้ว (คลิก page สุดท้ายได้)
- [ ] Zone chart แสดงตัวเลขทุก segment แม้เล็ก (ใช้ min-width + font ย่อ)

## Deploy Workflow
```bash
git clone https://github.com/baspiopm45/nhso-app.git
cd nhso-app
# แก้ไฟล์
git add .
git commit -m "feat: ..."
git push
# GitHub Pages auto-deploy จาก main branch
```

## Design System (viewer.html)
```css
--bg: #F5F0E8        /* warm cream background */
--sidebar-bg: #1C1917 /* dark sidebar */
--accent: #CC785C    /* copper/orange accent */
--card-bg: #FFFFFF
--text: #1C1917
```
