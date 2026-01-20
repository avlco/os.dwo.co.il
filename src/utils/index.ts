/**
 * יוצר URL לעמוד עם תמיכה ב-query parameters
 * @param pageName - שם העמוד
 * @param params - אובייקט עם פרמטרים (אופציונלי)
 * @returns URL מלא
 * 
 * @example
 * createPageUrl('MailView', { id: 'abc123' })
 * // returns: '/MailView?id=abc123'
 */
export function createPageUrl(pageName: string, params?: Record<string, string>): string {
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
