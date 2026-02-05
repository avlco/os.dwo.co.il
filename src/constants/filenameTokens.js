/**
 * Single source of truth for filename tokens.
 * Used by FilenameTemplateInput, AutomationRulesManager, and other UI components.
 * Backend resolver lives in functions/utils/folderPathBuilders.ts (FILENAME_TOKENS).
 */
export const FILENAME_TOKENS = [
  { key: '{Case_No}', label: 'מספר תיק', example: '123456' },
  { key: '{Client_Name}', label: 'שם לקוח', example: 'אינטל' },
  { key: '{Client_No}', label: 'מספר לקוח', example: '789' },
  { key: '{Case_Type}', label: 'סוג תיק', example: 'patent' },
  { key: '{Official_No}', label: 'מספר רשמי', example: '2024001' },
  { key: '{Mail_Subject}', label: 'נושא המייל', example: 'OA' },
  { key: '{Mail_Date}', label: 'תאריך המייל', example: '2025-01-15' },
  { key: '{Date}', label: 'תאריך היום', example: '2025-01-15' },
  { key: '{Year}', label: 'שנה', example: '2025' },
  { key: '{Month}', label: 'חודש', example: '01' },
  { key: '{Original_Filename}', label: 'שם קובץ מקורי', example: 'document.pdf' },
];
