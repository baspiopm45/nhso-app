// ============================================================
//  NHSO Web App - Google Configuration
//  แก้ไขค่าด้านล่างก่อนใช้งาน
// ============================================================

const CONFIG = {
  // 1) Client ID จาก Google Cloud Console
  //    APIs & Services > Credentials > OAuth 2.0 Client IDs
  CLIENT_ID: '986692337910-cv8lvufhi9hp3iqu3dg41l2onmopkkkr.apps.googleusercontent.com',

  // 2) Spreadsheet ID ของ Google Sheet ที่คุณสร้าง
  //    เอามาจาก URL: https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit
  SPREADSHEET_ID: '1BJD_P-aaRNlnqBKUExZwH-uUl_4aITFvag0QlyudSmw',

  // 3) ชื่อ Sheet ที่ใช้งาน (ตรงกับชื่อ Tab ใน Google Sheet)
  SHEET_NAME: 'Master',

  // ─── Role-based Access Control ───────────────────────────
  // Admin: email ลงท้าย @ADMIN_DOMAIN → เข้าได้ทุกฟีเจอร์
  ADMIN_DOMAIN: 'perceptra.tech',

  // Viewer: email นอกองค์กรที่อนุญาตเฉพาะ → ดูได้อย่างเดียว
  // เพิ่ม email ได้ที่นี่
  VIEWER_EMAILS: [
    'nongkoi.nhso@gmail.com',
    'baspiopm45@gmail.com',
    'jeabpharmacy@gmail.com',
  ],

  // (เดิม - ไม่ใช้แล้ว แต่เก็บไว้)
  ALLOWED_DOMAIN: null,

  // คอลัมน์ที่เป็นสูตรใน Sheet (เช่น XLOOKUP จาก tab Doc tracking) — แอปห้ามเขียนทับเด็ดขาด
  // ตอนเซฟจะข้ามคอลัมน์เหล่านี้ (เขียนเป็นหลาย range รอบๆ แทน)
  FORMULA_COLUMNS: ['Sales Doc'],

  // Column definitions (สำคัญ: ต้องตรงกับ Header row ใน Google Sheet)
  COLUMNS: {
    PHASE: 'Phase',
    ORDER: 'ลำดับ',
    HOSPITAL: 'ชื่อหน่วยบริการ',
    TYPE: 'ประเภท',
    AFFILIATION: 'สังกัด',
    HEALTH_ZONE: 'เขตสุขภาพ',
    HCODE: 'HCODE',
    LEVEL: 'ระดับ',
    PROVINCE: 'จังหวัด',
    PACS: 'PACS',
    PRIORITY: 'Priority Group',
    SALES: 'Sales',
    CONTACT: 'ผู้ให้ข้อมูล',
    PHONE: 'เบอร์',
    EMAIL: 'email',
    STATUS: 'Implement Status',
    SEND_DATE: 'วันที่ส่งเครื่องไป',
    GOLIVE: 'Golive Date',
    CONTRACT_START: 'วันที่เริ่มสัญญา',
    CONTRACT_END: 'วันที่สิ้นสุดสัญญา',
    SALES_DOC: 'Sales Doc',
    CONTRACT_DOC: 'Contract Doc',
    PAID: 'Paid?',
    DELIVERY_ACK: 'ได้ใบตอบรับการส่งมอบ',
  },

  // ─── Status Groups (R2: นิยามกลาง — admin (app.js) และ viewer (viewer.html) ใช้ชุดเดียวกัน) ───
  // แก้การจัดกลุ่มสถานะที่นี่ที่เดียว ห้ามไปแก้ list ในแอปแยกกัน
  STATUS_GROUPS: {
    LIVED_PREFIX: 'Lived',   // สถานะที่ขึ้นต้นด้วยคำนี้ = Golive แล้ว (รวม "Lived and Re-Check…")
    PROGRESS: [
      'Machine in Transit',
      'In process config network with IT',
      'Ready for Training',
      'Waiting for Integrate with PACS',        // มีเครื่อง/กำลัง integrate = งานเดินอยู่
      'Ready for Sending Waiting for address',  // เตรียมส่งแล้ว = งานเดินอยู่
    ],
    WAITING: [
      'Waiting for Swaping',
      '-',
      '',
    ],
    // รพ. ที่สละสิทธิ์ไม่เข้าร่วมโครงการ — แยกกลุ่มของตัวเอง คงอยู่ในฐานจำนวนรวม
    WAIVED: ['Waive'],
    // ค่าในคอลัมน์ Sales Doc (เทียบแบบ lowercase) ที่ถือว่า "เริ่มทำเอกสารขายแล้ว"
    // → derive เป็นสถานะ "อยู่ระหว่างทำสัญญา" เมื่อยังไม่มี Implement Status
    // รองรับทั้งค่าใหม่ (Completed / In progress จาก XLOOKUP tab Doc tracking) และ TRUE เดิมช่วง migrate
    SALES_DOC_ACTIVE: ['in progress', 'completed', 'true', 'yes', '1'],
    // สถานะที่ไม่เข้ากลุ่มไหนเลย → การ์ด "สถานะอื่นๆ" (R3) จะโชว์อัตโนมัติ
  },

  // Status options
  STATUS_OPTIONS: [
    '-',
    'Contract in progress',
    'Lived',
    'Ready for Training',
    'Ready for Sending Waiting for address',
    'Machine in Transit',
    'In process config network with IT',
    'Waiting for Integrate with PACS',
    'Waiting for Swaping',
  ],

  // Level options
  LEVEL_OPTIONS: ['S', 'M1', 'M2', 'F1', 'F2', 'F3', 'A'],

  // Phase options
  PHASE_OPTIONS: ['1', '2', '2.1', '2.2'],
};
