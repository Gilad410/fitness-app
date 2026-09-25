import ExcelJS from 'exceljs'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const importDir = path.resolve(here, '..')
const rd = (p) => JSON.parse(readFileSync(path.join(importDir, p), 'utf8'))

function round1(v) {
  if (v === null || v === undefined || Number.isNaN(v)) return null
  return Math.round(v * 10) / 10
}

const finalPreserved = rd('out/HEBREW_FINAL_PRESERVED.json')
const finalSourceProvided = rd('out/HEBREW_FINAL_SOURCE_PROVIDED.json')
const namingExclusions = rd('out/HEBREW_NAMING_EXCLUSIONS.json')

const bucket2 = rd('out/bucket2_remaining.json')
const bucketArr = Array.isArray(bucket2) ? bucket2 : Object.values(bucket2)
const bucketByBc = new Map(bucketArr.map((x) => [x.barcode, x]))
const the24Worklist = rd('ledger/the24_worklist.json')
const the24ByBc = new Map(the24Worklist.map((x) => [x.barcode, x]))

// original 149 exceptions (pre-Hebrew-naming round)
const categorization = rd('out/CATEGORIZATION_976.json')
const m = rd('out/MASTER_AUDIT_976.json')
const t24 = rd('ledger/the24_reconciled.json')
const rejected = rd('out/REAL_PIPELINE_REJECTED.json')
const needsReview = rd('out/FINAL_NEEDS_REVIEW.json')
const nameCollisions149 = rd('out/EXCLUDED_NAME_COLLISIONS.json')

const NAME_SOURCE_HE = {
  already_hebrew: 'שם עברי קיים במקור',
  off_source_name_he: 'שם עברי מ-Open Food Facts (ללא שינוי)',
  off_source_name_he_enhanced: 'שם עברי מ-Open Food Facts (הושלם פרט מבדיל)',
  translated: 'תורגם לעברית על ידי הביקורת',
}
function nameSourceLabel(nameSource) {
  const base = nameSource.replace(/_transliterated$/, '')
  const label = NAME_SOURCE_HE[base] || base
  return nameSource.endsWith('_transliterated') ? label + ' + תועתק שם מותג/פריט מלטינית לעברית' : label
}

// ===== Build main sheet rows =====
const mainRows = []
let seq = 1
for (const r of finalPreserved) {
  const item = bucketByBc.get(r.barcode) || the24ByBc.get(r.barcode)
  mainRows.push({
    seq: seq++,
    barcode: r.barcode,
    hebrewName: r.hebrewName,
    originalName: r.name,
    brand: item ? item.brand : '',
    calories: round1(r.storedCalories),
    protein: round1(r.storedProtein),
    basis: 'ל-100 גרם',
    category: 'קבוצת המאומתים (189) -- אימות עצמאי (שתי קריאות בלתי תלויות)',
    sourceRef: 'אימות עצמאי -- תמונת תווית / אתר יצרן',
    note: r.nameSource.includes('translated') || r.nameSource.includes('transliterated') ? 'שם תורגם/תועתק לעברית עבור ביקורת זו' : '',
  })
}
for (const r of finalSourceProvided) {
  mainRows.push({
    seq: seq++,
    barcode: r.barcode,
    hebrewName: r.hebrewName,
    originalName: r.name,
    brand: r.brand || '',
    calories: round1(r.calories),
    protein: round1(r.protein),
    basis: 'ל-100 גרם',
    category: 'מקור נתונים -- ללא אימות עצמאי (Open Food Facts)',
    sourceRef: r.sourceUrl,
    note: nameSourceLabel(r.nameSource) + (r.nameSource !== 'already_hebrew' ? ' -- לא אומת באופן עצמאי' : ''),
  })
}

// ===== Build exceptions sheet rows =====
const excRows = []
for (const bc of categorization.correction_proposed) {
  const r = m[bc]
  excRows.push({ barcode: bc, name: r.name, category: 'סתירה ידועה -- תיקון מוצע', reason: 'הראיות שנאספו סותרות את הערך השמור: ' + r.evidence })
}
for (const bc of categorization.unresolved_conflict) {
  const r = m[bc]
  excRows.push({ barcode: bc, name: r.name, category: 'סתירה ידועה -- לא נפתר', reason: r.evidence })
}
for (const bc in t24) {
  if (t24[bc].finalOutcome === 'VERIFIED') continue
  excRows.push({ barcode: bc, name: t24[bc].name, category: 'סתירה ידועה (24 המוקדמים)', reason: t24[bc].justification })
}
for (const r of rejected) {
  excRows.push({ barcode: r.barcode, name: '', category: 'נכשל בבדיקות תקינות היבוא', reason: 'סיבה: ' + r.reason })
}
for (const r of needsReview) {
  excRows.push({ barcode: r.barcode, name: r.name, category: 'ממתין לבדיקה -- אי-התאמת מאקרו', reason: 'בדיקת עקביות קלוריות/מאקרו (אטווטר) נכשלה: ' + JSON.stringify(r.macroCheck) })
}
for (const r of nameCollisions149) {
  excRows.push({ barcode: r.barcode, name: r.name, category: 'התנגשות שם (לפני תרגום)', reason: r.reason })
}
for (const r of namingExclusions) {
  const isCollision = r.reason.includes('התנגשות')
  excRows.push({ barcode: r.barcode, name: r.name, category: isCollision ? 'התנגשות שם (לאחר תרגום לעברית)' : 'לא ניתן לקבוע שם עברי מדויק', reason: r.reason })
}

// ===== Build workbook =====
const wb = new ExcelJS.Workbook()
wb.creator = 'Food Catalog Audit'
wb.created = new Date()

// --- Sheet 1: Main import table ---
const ws = wb.addWorksheet('טבלת ייבוא', { views: [{ rightToLeft: true, state: 'frozen', ySplit: 1 }] })
ws.columns = [
  { header: '#', key: 'seq', width: 6 },
  { header: 'ברקוד', key: 'barcode', width: 18 },
  { header: 'שם תצוגה באתר (עברית בלבד)', key: 'hebrewName', width: 45 },
  { header: 'שם מקור (שפה זרה -- לעיון בלבד, אינו מוצג באתר)', key: 'originalName', width: 45 },
  { header: 'מותג', key: 'brand', width: 20 },
  { header: 'קלוריות ל-100 גרם', key: 'calories', width: 16 },
  { header: 'חלבון (גרם) ל-100 גרם', key: 'protein', width: 18 },
  { header: 'בסיס תזונתי', key: 'basis', width: 14 },
  { header: 'קטגוריית אימות', key: 'category', width: 45 },
  { header: 'מקור / אסמכתא', key: 'sourceRef', width: 45 },
  { header: 'הערה', key: 'note', width: 35 },
]
ws.getRow(1).font = { bold: true }
ws.getRow(1).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } }
for (const r of mainRows) {
  const row = ws.addRow(r)
  row.getCell('barcode').numFmt = '@' // force text, preserve leading zeros
  row.getCell('barcode').value = r.barcode // ensure stored as string
  row.alignment = { horizontal: 'right', vertical: 'top', wrapText: true }
  row.getCell('calories').alignment = { horizontal: 'center' }
  row.getCell('protein').alignment = { horizontal: 'center' }
  row.getCell('seq').alignment = { horizontal: 'center' }
}
ws.autoFilter = { from: 'A1', to: 'K1' }

// --- Sheet 2: Exceptions ---
const ws2 = wb.addWorksheet('רשימת חריגים', { views: [{ rightToLeft: true, state: 'frozen', ySplit: 1 }] })
ws2.columns = [
  { header: '#', key: 'seq', width: 6 },
  { header: 'ברקוד', key: 'barcode', width: 18 },
  { header: 'שם', key: 'name', width: 40 },
  { header: 'קטגוריית חריגה', key: 'category', width: 30 },
  { header: 'סיבה', key: 'reason', width: 90 },
]
ws2.getRow(1).font = { bold: true }
ws2.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8D7DA' } }
ws2.getRow(1).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
let excSeq = 1
for (const r of excRows) {
  const row = ws2.addRow({ seq: excSeq++, barcode: r.barcode, name: r.name, category: r.category, reason: r.reason })
  row.getCell('barcode').numFmt = '@'
  row.getCell('barcode').value = r.barcode
  row.alignment = { horizontal: 'right', vertical: 'top', wrapText: true }
}
ws2.autoFilter = { from: 'A1', to: 'E1' }

// --- Sheet 3: Summary ---
const ws3 = wb.addWorksheet('סיכום', { views: [{ rightToLeft: true }] })
ws3.getColumn(1).width = 55
ws3.getColumn(2).width = 15
const summaryData = [
  ['סיכום ביקורת קטלוג המזון -- הצעה לייבוא', ''],
  ['', ''],
  ['מוצרים מוצעים לייבוא (סה"כ)', mainRows.length],
  ['   מתוכם: קבוצת המאומתים (189 המקורית, לאחר בדיקת שם עברי)', finalPreserved.length],
  ['   מתוכם: מקור נתונים ללא אימות עצמאי (Open Food Facts)', finalSourceProvided.length],
  ['', ''],
  ['מוצרים שהוחרגו (סה"כ)', excRows.length],
  ['   סתירה ידועה בנתונים (תיקון מוצע / לא נפתר)', categorization.correction_proposed.length + categorization.unresolved_conflict.length + Object.values(t24).filter(r => r.finalOutcome !== 'VERIFIED').length],
  ['   נכשל בבדיקות תקינות יבוא (חסר שם מוצר וכו\')', rejected.length],
  ['   ממתין לבדיקה -- אי-התאמת מאקרו-נוטריינטים', needsReview.length],
  ['   התנגשות שם (לפני תרגום לעברית)', nameCollisions149.length],
  ['   לא ניתן לקבוע שם עברי מדויק', namingExclusions.filter(r => !r.reason.includes('התנגשות')).length],
  ['   התנגשות שם (לאחר תרגום לעברית)', namingExclusions.filter(r => r.reason.includes('התנגשות')).length],
  ['', ''],
  ['מוצרי פרודקשן קיימים (ללא שינוי)', 504],
  ['סה"כ קטלוג משוער (קיימים + מוצעים)', 504 + mainRows.length],
  ['', ''],
  ['הערה', 'לא בוצע שינוי בנתוני הפרודקשן הקיימים. לא הורץ קוד SQL. זהו קובץ להכנה ובדיקה בלבד.'],
]
for (const [label, value] of summaryData) {
  const row = ws3.addRow([label, value])
  row.getCell(1).font = label.includes('סיכום') ? { bold: true, size: 14 } : (label.startsWith('   ') ? {} : { bold: true })
  row.alignment = { horizontal: 'right' }
}

const outPath = path.join(importDir, 'out', 'טבלת_ייבוא_קטלוג_מזון.xlsx')
await wb.xlsx.writeFile(outPath)
console.log('Workbook written to:', outPath)
console.log('Main sheet rows:', mainRows.length, '| Exceptions sheet rows:', excRows.length)
