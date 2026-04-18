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

  // 4) (Optional) จำกัดให้เฉพาะ email นี้ login ได้ เช่น 'yourteam.com'
  //    ถ้าไม่จำกัด ให้ตั้งเป็น null
  ADMIN_DOMAIN: 'perceptra.tech',
  VIEWER_EMAILS: ['nongkoi.nhso@gmail.com','baspiopm45@gmail.com'],
  ALLOWED_DOMAIN: null,

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

  // Status options
  STATUS_OPTIONS: [
    '-',
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
