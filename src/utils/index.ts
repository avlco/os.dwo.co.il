import { format, toZonedTime } from 'date-fns-tz';

/**
 * יוצר URL לעמוד עם תמיכה ב-query parameters
 * @param {string} pageName - שם העמוד
 * @param {Record<string, string>} [params] - אובייקט עם פרמטרים (אופציונלי)
 * @returns {string} URL מלא
 * 
 * @example
 * createPageUrl('MailView', { id: 'abc123' })
 * // returns: '/MailView?id=abc123'
 */
export function createPageUrl(pageName, params) {
    let url = '/' + pageName.replace(/ /g, '-');
    
    if (params && Object.keys(params).length > 0) {
        const searchParams = new URLSearchParams();
        for (const [key, value] of Object.entries(params)) {
            if (value !== undefined && value !== null && value !== '') {
                searchParams.append(key, value);
            }
        }
        const queryString = searchParams.toString();
        if (queryString) {
            url += '?' + queryString;
        }
    }
    
    return url;
}

// ============================================
// Date Formatting Utilities
// ============================================

const ISRAEL_TZ = 'Asia/Jerusalem';

/**
 * ממיר תאריך ל-Israel timezone ומפרמט אותו
 * @param {Date | string | number | null | undefined} date - תאריך (Date, string, או timestamp)
 * @param {string} [formatString='dd/MM/yyyy HH:mm'] - פורמט התצוגה
 * @returns {string} תאריך מפורמט או '-' אם לא קיים
 * 
 * @example
 * formatDateTime('2024-01-15T10:30:00Z')
 * // returns: '15/01/2024 12:30' (אם Israel ב-UTC+2)
 */
export function formatDateTime(date, formatString = 'dd/MM/yyyy HH:mm') {
    if (!date) return '-';
    
    try {
        const dateObj = typeof date === 'string' || typeof date === 'number' 
            ? new Date(date) 
            : date;
        
        if (isNaN(dateObj.getTime())) return '-';
        
        const zonedDate = toZonedTime(dateObj, ISRAEL_TZ);
        return format(zonedDate, formatString, { timeZone: ISRAEL_TZ });
    } catch (error) {
        console.error('Error formatting date:', error);
        return '-';
    }
}

/**
 * מפרמט תאריך בלי שעה (dd/MM/yyyy)
 * @param {Date | string | number | null | undefined} date - תאריך
 * @returns {string} תאריך מפורמט או '-'
 * 
 * @example
 * formatDate('2024-01-15T10:30:00Z')
 * // returns: '15/01/2024'
 */
export function formatDate(date) {
    return formatDateTime(date, 'dd/MM/yyyy');
}

/**
 * מפרמט רק שעה (HH:mm)
 * @param {Date | string | number | null | undefined} date - תאריך
 * @returns {string} שעה מפורמטת או '-'
 * 
 * @example
 * formatTime('2024-01-15T10:30:00Z')
 * // returns: '12:30' (אם Israel ב-UTC+2)
 */
export function formatTime(date) {
    return formatDateTime(date, 'HH:mm');
}

/**
 * מפרמט תאריך קצר (dd/MM/yy)
 * @param {Date | string | number | null | undefined} date - תאריך
 * @returns {string} תאריך קצר או '-'
 * 
 * @example
 * formatDateShort('2024-01-15')
 * // returns: '15/01/24'
 */
export function formatDateShort(date) {
    return formatDateTime(date, 'dd/MM/yy');
}
