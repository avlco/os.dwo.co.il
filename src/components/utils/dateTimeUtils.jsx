/**
 * Date/Time Formatting Utilities
 * 
 * מודול זה מספק פונקציות אחידות לפורמט תאריכים וזמנים בכל המערכת.
 * הוא משתמש בהעדפות המשתמש (אם קיימות) או בברירות מחדל גלובליות.
 * 
 * חשוב: כל התאריכים מה-backend מגיעים ב-UTC (ISO 8601).
 * פונקציות הפורמט ממירות אותם לאזור הזמן המוגדר בהגדרות המשתמש.
 */

import { parseISO } from 'date-fns';
import { he, enUS } from 'date-fns/locale';
import { format as formatTz } from 'date-fns-tz';

/**
 * מוודא שמחרוזת תאריך מפורשת כ-UTC.
 * אם המחרוזת לא מכילה סימון אזור זמן מפורש (Z או קיזוז ±HH:MM),
 * מוסיפה 'Z' כדי לוודא ש-parseISO תפרש אותה כ-UTC ולא כזמן מקומי.
 */
function ensureUTC(dateString) {
  if (!dateString || typeof dateString !== 'string') return dateString;
  // אם כבר יש סימון UTC או קיזוז - אין צורך בשינוי
  if (dateString.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(dateString) || /[+-]\d{4}$/.test(dateString)) {
    return dateString;
  }
  return dateString + 'Z';
}

/**
 * ניתוח מחרוזת תאריך לאובייקט Date, תוך וידוא פרשנות UTC
 */
function parseDateSafe(date) {
  if (typeof date === 'string') {
    return parseISO(ensureUTC(date));
  }
  return new Date(date);
}

// ברירות מחדל גלובליות
export const DEFAULT_SETTINGS = {
  timezone: 'Asia/Jerusalem',
  dateFormat: 'dd/MM/yyyy',
  timeFormat: 'HH:mm',
  datetimeFormat: 'dd/MM/yyyy HH:mm',
  language: 'he'
};

// אפשרויות פורמט זמינות
export const FORMAT_OPTIONS = {
  dateFormats: [
    { value: 'dd/MM/yyyy', label: '31/12/2024', labelEn: '31/12/2024' },
    { value: 'MM/dd/yyyy', label: '12/31/2024', labelEn: '12/31/2024' },
    { value: 'yyyy-MM-dd', label: '2024-12-31', labelEn: '2024-12-31' },
    { value: 'dd.MM.yyyy', label: '31.12.2024', labelEn: '31.12.2024' },
    { value: 'dd-MM-yyyy', label: '31-12-2024', labelEn: '31-12-2024' }
  ],
  timeFormats: [
    { value: 'HH:mm', label: '14:30 (24 שעות)', labelEn: '14:30 (24-hour)' },
    { value: 'hh:mm a', label: '02:30 PM (12 שעות)', labelEn: '02:30 PM (12-hour)' },
    { value: 'HH:mm:ss', label: '14:30:00 (עם שניות)', labelEn: '14:30:00 (with seconds)' }
  ],
  datetimeFormats: [
    { value: 'dd/MM/yyyy HH:mm', label: '31/12/2024 14:30', labelEn: '31/12/2024 14:30' },
    { value: 'MM/dd/yyyy hh:mm a', label: '12/31/2024 02:30 PM', labelEn: '12/31/2024 02:30 PM' },
    { value: 'yyyy-MM-dd HH:mm', label: '2024-12-31 14:30', labelEn: '2024-12-31 14:30' },
    { value: 'dd.MM.yyyy HH:mm', label: '31.12.2024 14:30', labelEn: '31.12.2024 14:30' }
  ],
  timezones: [
    { value: 'Asia/Jerusalem', label: 'ישראל (Asia/Jerusalem)', labelEn: 'Israel (Asia/Jerusalem)' },
    { value: 'Europe/London', label: 'לונדון (Europe/London)', labelEn: 'London (Europe/London)' },
    { value: 'America/New_York', label: 'ניו יורק (America/New_York)', labelEn: 'New York (America/New_York)' },
    { value: 'America/Los_Angeles', label: 'לוס אנג\'לס (America/Los_Angeles)', labelEn: 'Los Angeles (America/Los_Angeles)' },
    { value: 'Europe/Berlin', label: 'ברלין (Europe/Berlin)', labelEn: 'Berlin (Europe/Berlin)' },
    { value: 'Europe/Paris', label: 'פריז (Europe/Paris)', labelEn: 'Paris (Europe/Paris)' },
    { value: 'Asia/Tokyo', label: 'טוקיו (Asia/Tokyo)', labelEn: 'Tokyo (Asia/Tokyo)' },
    { value: 'UTC', label: 'UTC', labelEn: 'UTC' }
  ]
};

/**
 * קבלת הגדרות התאריך/שעה הנוכחיות
 * @param {Object} user - אובייקט המשתמש (אופציונלי)
 * @param {string} language - שפת הממשק הנוכחית
 * @returns {Object} הגדרות התאריך/שעה
 */
export function getDateTimeSettings(user = null, language = 'he') {
  // אם יש משתמש עם העדפות מוגדרות, השתמש בהן
  if (user) {
    return {
      timezone: user.preferred_timezone || DEFAULT_SETTINGS.timezone,
      dateFormat: user.preferred_date_format || DEFAULT_SETTINGS.dateFormat,
      timeFormat: user.preferred_time_format || DEFAULT_SETTINGS.timeFormat,
      datetimeFormat: user.preferred_datetime_format || DEFAULT_SETTINGS.datetimeFormat,
      language: language || DEFAULT_SETTINGS.language
    };
  }

  // אחרת, החזר ברירות מחדל
  return {
    ...DEFAULT_SETTINGS,
    language: language || DEFAULT_SETTINGS.language
  };
}

/**
 * קבלת ה-locale המתאים לשפה
 * @param {string} language - קוד שפה ('he' או 'en')
 * @returns {Object} אובייקט locale של date-fns
 */
export function getLocale(language = 'he') {
  return language === 'he' ? he : enUS;
}

/**
 * פורמט תאריך
 * @param {Date|string|number} date - התאריך לפרמוט (UTC)
 * @param {Object} settings - הגדרות (אופציונלי)
 * @param {string} customFormat - פורמט מותאם אישית (אופציונלי)
 * @returns {string} התאריך המפורמט באזור הזמן של המשתמש
 */
export function formatDate(date, settings = null, customFormat = null) {
  if (!date) return '-';
  
  const effectiveSettings = settings || getDateTimeSettings();
  const formatString = customFormat || effectiveSettings.dateFormat;
  const locale = getLocale(effectiveSettings.language);
  const timezone = effectiveSettings.timezone || DEFAULT_SETTINGS.timezone;
  
  const dateObj = parseDateSafe(date);
  
  if (isNaN(dateObj.getTime())) return '-';
  
  return formatTz(dateObj, formatString, { timeZone: timezone, locale });
}

/**
 * פורמט שעה
 * @param {Date|string|number} date - התאריך/שעה לפרמוט (UTC)
 * @param {Object} settings - הגדרות (אופציונלי)
 * @param {string} customFormat - פורמט מותאם אישית (אופציונלי)
 * @returns {string} השעה המפורמטת באזור הזמן של המשתמש
 */
export function formatTime(date, settings = null, customFormat = null) {
  if (!date) return '-';
  
  const effectiveSettings = settings || getDateTimeSettings();
  const formatString = customFormat || effectiveSettings.timeFormat;
  const locale = getLocale(effectiveSettings.language);
  const timezone = effectiveSettings.timezone || DEFAULT_SETTINGS.timezone;
  
  const dateObj = parseDateSafe(date);
  
  if (isNaN(dateObj.getTime())) return '-';
  
  return formatTz(dateObj, formatString, { timeZone: timezone, locale });
}

/**
 * פורמט תאריך ושעה
 * @param {Date|string|number} date - התאריך/שעה לפרמוט (UTC)
 * @param {Object} settings - הגדרות (אופציונלי)
 * @param {string} customFormat - פורמט מותאם אישית (אופציונלי)
 * @returns {string} התאריך והשעה המפורמטים באזור הזמן של המשתמש
 */
export function formatDateTime(date, settings = null, customFormat = null) {
  if (!date) return '-';
  
  const effectiveSettings = settings || getDateTimeSettings();
  const formatString = customFormat || effectiveSettings.datetimeFormat;
  const locale = getLocale(effectiveSettings.language);
  const timezone = effectiveSettings.timezone || DEFAULT_SETTINGS.timezone;
  
  const dateObj = parseDateSafe(date);
  
  if (isNaN(dateObj.getTime())) return '-';
  
  return formatTz(dateObj, formatString, { timeZone: timezone, locale });
}

/**
 * פורמט יחסי (לוח שנה) - לשימוש בתצוגות לוח שנה
 * @param {Date|string|number} date - התאריך לפרמוט (UTC)
 * @param {string} formatStr - פורמט date-fns
 * @param {Object} settings - הגדרות (אופציונלי)
 * @returns {string} התאריך המפורמט באזור הזמן של המשתמש
 */
export function formatCalendar(date, formatStr, settings = null) {
  if (!date) return '-';
  
  const effectiveSettings = settings || getDateTimeSettings();
  const locale = getLocale(effectiveSettings.language);
  const timezone = effectiveSettings.timezone || DEFAULT_SETTINGS.timezone;
  
  const dateObj = parseDateSafe(date);
  
  if (isNaN(dateObj.getTime())) return '-';
  
  return formatTz(dateObj, formatStr, { timeZone: timezone, locale });
}

/**
 * פורמט לשימוש ב-input type="date"
 * @param {Date|string|number} date - התאריך
 * @param {Object} settings - הגדרות (אופציונלי)
 * @returns {string} התאריך בפורמט yyyy-MM-dd באזור הזמן המוגדר
 */
export function formatForDateInput(date, settings = null) {
  if (!date) return '';
  
  const effectiveSettings = settings || getDateTimeSettings();
  const timezone = effectiveSettings.timezone || DEFAULT_SETTINGS.timezone;
  
  const dateObj = typeof date === 'string' ? parseISO(date) : new Date(date);
  
  if (isNaN(dateObj.getTime())) return '';
  
  // המרה לאזור הזמן המוגדר
  return formatTz(dateObj, 'yyyy-MM-dd', { timeZone: timezone });
}

/**
 * פורמט לשימוש ב-input type="datetime-local"
 * @param {Date|string|number} date - התאריך/שעה
 * @param {Object} settings - הגדרות (אופציונלי)
 * @returns {string} התאריך/שעה בפורמט yyyy-MM-dd'T'HH:mm באזור הזמן המוגדר
 */
export function formatForDateTimeInput(date, settings = null) {
  if (!date) return '';
  
  const effectiveSettings = settings || getDateTimeSettings();
  const timezone = effectiveSettings.timezone || DEFAULT_SETTINGS.timezone;
  
  const dateObj = typeof date === 'string' ? parseISO(date) : new Date(date);
  
  if (isNaN(dateObj.getTime())) return '';
  
  // המרה לאזור הזמן המוגדר
  return formatTz(dateObj, "yyyy-MM-dd'T'HH:mm", { timeZone: timezone });
}

export default {
  DEFAULT_SETTINGS,
  FORMAT_OPTIONS,
  getDateTimeSettings,
  getLocale,
  formatDate,
  formatTime,
  formatDateTime,
  formatCalendar,
  formatForDateInput,
  formatForDateTimeInput
};