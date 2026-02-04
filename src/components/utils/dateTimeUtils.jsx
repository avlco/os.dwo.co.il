/**
 * Date/Time Formatting Utilities
 * 
 * מודול זה מספק פונקציות אחידות לפורמט תאריכים וזמנים בכל המערכת.
 * הוא משתמש בהעדפות המשתמש (אם קיימות) או בברירות מחדל גלובליות.
 */

import { format as dateFnsFormat, parseISO } from 'date-fns';
import { he, enUS } from 'date-fns/locale';

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
 * @param {Date|string|number} date - התאריך לפרמוט
 * @param {Object} settings - הגדרות (אופציונלי)
 * @param {string} customFormat - פורמט מותאם אישית (אופציונלי)
 * @returns {string} התאריך המפורמט
 */
export function formatDate(date, settings = null, customFormat = null) {
  if (!date) return '-';
  
  const effectiveSettings = settings || getDateTimeSettings();
  const formatString = customFormat || effectiveSettings.dateFormat;
  const locale = getLocale(effectiveSettings.language);
  
  const dateObj = typeof date === 'string' ? parseISO(date) : new Date(date);
  
  if (isNaN(dateObj.getTime())) return '-';
  
  return dateFnsFormat(dateObj, formatString, { locale });
}

/**
 * פורמט שעה
 * @param {Date|string|number} date - התאריך/שעה לפרמוט
 * @param {Object} settings - הגדרות (אופציונלי)
 * @param {string} customFormat - פורמט מותאם אישית (אופציונלי)
 * @returns {string} השעה המפורמטת
 */
export function formatTime(date, settings = null, customFormat = null) {
  if (!date) return '-';
  
  const effectiveSettings = settings || getDateTimeSettings();
  const formatString = customFormat || effectiveSettings.timeFormat;
  const locale = getLocale(effectiveSettings.language);
  
  const dateObj = typeof date === 'string' ? parseISO(date) : new Date(date);
  
  if (isNaN(dateObj.getTime())) return '-';
  
  return dateFnsFormat(dateObj, formatString, { locale });
}

/**
 * פורמט תאריך ושעה
 * @param {Date|string|number} date - התאריך/שעה לפרמוט
 * @param {Object} settings - הגדרות (אופציונלי)
 * @param {string} customFormat - פורמט מותאם אישית (אופציונלי)
 * @returns {string} התאריך והשעה המפורמטים
 */
export function formatDateTime(date, settings = null, customFormat = null) {
  if (!date) return '-';
  
  const effectiveSettings = settings || getDateTimeSettings();
  const formatString = customFormat || effectiveSettings.datetimeFormat;
  const locale = getLocale(effectiveSettings.language);
  
  const dateObj = typeof date === 'string' ? parseISO(date) : new Date(date);
  
  if (isNaN(dateObj.getTime())) return '-';
  
  return dateFnsFormat(dateObj, formatString, { locale });
}

/**
 * פורמט יחסי (לוח שנה) - לשימוש בתצוגות לוח שנה
 * @param {Date|string|number} date - התאריך לפרמוט
 * @param {string} formatStr - פורמט date-fns
 * @param {Object} settings - הגדרות (אופציונלי)
 * @returns {string} התאריך המפורמט
 */
export function formatCalendar(date, formatStr, settings = null) {
  if (!date) return '-';
  
  const effectiveSettings = settings || getDateTimeSettings();
  const locale = getLocale(effectiveSettings.language);
  
  const dateObj = typeof date === 'string' ? parseISO(date) : new Date(date);
  
  if (isNaN(dateObj.getTime())) return '-';
  
  return dateFnsFormat(dateObj, formatStr, { locale });
}

/**
 * פורמט לשימוש ב-input type="date"
 * @param {Date|string|number} date - התאריך
 * @returns {string} התאריך בפורמט yyyy-MM-dd
 */
export function formatForDateInput(date) {
  if (!date) return '';
  
  const dateObj = typeof date === 'string' ? parseISO(date) : new Date(date);
  
  if (isNaN(dateObj.getTime())) return '';
  
  return dateFnsFormat(dateObj, 'yyyy-MM-dd');
}

/**
 * פורמט לשימוש ב-input type="datetime-local"
 * @param {Date|string|number} date - התאריך/שעה
 * @returns {string} התאריך/שעה בפורמט yyyy-MM-dd'T'HH:mm
 */
export function formatForDateTimeInput(date) {
  if (!date) return '';
  
  const dateObj = typeof date === 'string' ? parseISO(date) : new Date(date);
  
  if (isNaN(dateObj.getTime())) return '';
  
  return dateFnsFormat(dateObj, "yyyy-MM-dd'T'HH:mm");
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