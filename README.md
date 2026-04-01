# NHSO Digital X-ray Management App

Web App สำหรับดูและจัดการข้อมูล Digital X-ray โครงการ สปสช.
เชื่อมต่อกับ Google Sheets | Login ด้วย Google OAuth

---

## 🚀 ขั้นตอนติดตั้งและตั้งค่า

### ขั้นที่ 1 — สร้าง Google Cloud Project

1. ไปที่ [https://console.cloud.google.com](https://console.cloud.google.com)
2. คลิก **Select a project** > **New Project**
3. ตั้งชื่อ เช่น `nhso-xray-app` แล้วคลิก **Create**

---

### ขั้นที่ 2 — เปิดใช้งาน Google Sheets API

1. ไปที่ **APIs & Services > Library**
2. ค้นหา `Google Sheets API`
3. คลิก **Enable**

---

### ขั้นที่ 3 — สร้าง OAuth 2.0 Client ID

1. ไปที่ **APIs & Services > Credentials**
2. คลิก **+ Create Credentials > OAuth client ID**
3. ถ้ายังไม่ได้ตั้ง OAuth consent screen:
   - กด **Configure Consent Screen**
   - เลือก **External** > **Create**
   - กรอก App name, User support email, Developer email
   - กด **Save and Continue** จนครบ แล้วกลับมา
4. เลือก Application type: **Web application**
5. ตั้งชื่อ: `NHSO App`
6. ใน **Authorized JavaScript origins** เพิ่ม:
   ```
   http://localhost:8000
   http://localhost:3000
   ```
   > ⚠️ ต้องไม่มี `/` ต่อท้าย URL
7. คลิก **Create**
8. คัดลอก **Client ID** (ยาวประมาณนี้: `123456789-abc...apps.googleusercontent.com`)

---

### ขั้นที่ 4 — เพิ่ม Test Users (สำหรับช่วง Development)

เพราะ OAuth Consent Screen ยังเป็นแบบ "Testing":
1. ไปที่ **APIs & Services > OAuth consent screen**
2. เลื่อนลงมาที่ **Test users**
3. คลิก **+ Add Users**
4. เพิ่ม Gmail ที่ต้องการให้ login ได้ (เช่น email ของทีมงาน)

---

### ขั้นที่ 5 — ตั้งค่า Google Sheet

1. เปิด Google Sheet ของคุณ:
   [https://docs.google.com/spreadsheets/d/1BJD_P-aaRNlnqBKUExZwH-uUl_4aITFvag0QlyudSmw/edit](https://docs.google.com/spreadsheets/d/1BJD_P-aaRNlnqBKUExZwH-uUl_4aITFvag0QlyudSmw/edit)
2. ตรวจสอบว่า **Sheet ชื่อ `Master`** มีอยู่จริง และ Row 1 เป็น Headers

---

### ขั้นที่ 6 — แก้ไข config.js

เปิดไฟล์ `config.js` แล้วแก้:

```javascript
CLIENT_ID: 'YOUR_CLIENT_ID.apps.googleusercontent.com',
// เปลี่ยนเป็น Client ID ที่ได้จากขั้นที่ 3
```

ค่า `SPREADSHEET_ID` ตั้งไว้แล้วเป็น:
```
1BJD_P-aaRNlnqBKUExZwH-uUl_4aITFvag0QlyudSmw
```

---

### ขั้นที่ 7 — รันบน localhost

เปิด Terminal แล้ว `cd` ไปที่โฟลเดอร์ `nhso-app`:

```bash
# วิธีที่ 1: Python (ง่ายที่สุด)
python3 -m http.server 8000

# วิธีที่ 2: Node.js
npx serve -p 8000

# วิธีที่ 3: VS Code > Live Server extension
# คลิกขวาที่ index.html > Open with Live Server
```

จากนั้นเปิด Browser ไปที่:
```
http://localhost:8000
```

---

## 📁 โครงสร้างไฟล์

```
nhso-app/
├── index.html      ← หน้าเว็บหลัก (HTML structure)
├── style.css       ← ออกแบบ UI (Thai-friendly design)
├── app.js          ← Logic ทั้งหมด (Auth, Sheets API, CRUD)
├── config.js       ← ตั้งค่า (CLIENT_ID, SPREADSHEET_ID)
└── README.md       ← คู่มือนี้
```

---

## 🎯 Features

| Feature | รายละเอียด |
|---------|-----------|
| 🔐 Google OAuth | Login ด้วย Google Account |
| 📊 Dashboard | สรุปสถิติ + กราฟ Bar Chart |
| 🔍 ค้นหา/กรอง | ค้นหาชื่อ, กรอง Phase/สถานะ/เขต |
| 📋 ตารางข้อมูล | แสดงข้อมูล 25 รายการต่อหน้า + Pagination |
| ✏️ แก้ไข | แก้ไขข้อมูลและ Save ลง Google Sheets |
| ➕ เพิ่ม | เพิ่มรายการใหม่ลง Google Sheets |
| 👁 ดูรายละเอียด | Pop-up แสดงข้อมูลครบทุก Column |
| 📄 Doc Tracking | ติดตาม Status เอกสาร |

---

## 🐛 Troubleshooting

**"Error 403: access_denied"**
→ ยังไม่ได้เพิ่ม email เป็น Test User (ขั้นที่ 4)

**"Error 400: redirect_uri_mismatch"**
→ URL ใน Authorized JavaScript origins ไม่ตรง (ขั้นที่ 3)
→ ตรวจสอบว่าใช้ `http://localhost:8000` ตรงกัน

**ข้อมูลไม่โหลด / Sheets API error**
→ ตรวจสอบ `SPREADSHEET_ID` ใน `config.js`
→ ตรวจสอบว่าเปิด Google Sheets API แล้ว (ขั้นที่ 2)
→ ตรวจสอบว่า Account ที่ Login มีสิทธิ์เข้าถึง Sheet

**หน้าขาว / ไม่มีอะไรขึ้น**
→ เปิด Browser DevTools (F12) > Console เพื่อดู Error
