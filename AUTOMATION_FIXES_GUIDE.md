# מדריך תיקוני אוטומציה ודיבאג

## 🔍 הבעיות שזוהו

### 1. **MailView לא מציג מיילים**
**סיבה:** הפונקציה `filter()` לא תמיד החזירה תוצאות
**תסמינים:** "מייל לא נמצא" למרות שהמייל קיים

### 2. **אוטומציות לא רצות**
**סיבה:** פונקציית `sendEmail` לא באמת שלחה מיילים
**תסמינים:** חוק נראה פעיל, אבל לא קורה כלום

### 3. **אין כלי דיבאג**
**סיבה:** אין דרך לבדוק למה חוק לא תופס מייל
**תסמינים:** לא יודע אם זה בגלל CATCH, הגדרות, או שגיאה

---

## ✅ התיקונים שבוצעו

### תיקון 1: MailView.jsx - תצוגת מיילים משופרת

**מה תוקן:**
- הוספתי **לוגיקת fallback** כפולה:
  1. ניסיון ראשון: `filter({ id: mailId })`
  2. ניסיון שני: `list()` + חיפוש ידני
- הוספתי **שגיאות מפורטות**:
  - אם אין `mailId` ב-URL
  - אם יש שגיאה בטעינה
  - אם המייל לא נמצא
- הוספתי **כפתור Debug** שמדפיס את כל המידע ל-Console

**איך זה עוזר:**
- כעת תראה **למה** המייל לא נמצא
- תוכל ללחוץ F12 ולראות את הלוגים
- תדע אם הבעיה ב-Base44 API או בנתונים

**קובץ:** `src/pages/MailView.jsx`

---

### תיקון 2: sendEmail.ts - שליחת מיילים אמיתית דרך Gmail API

**מה תוקן:**
- השתמשתי ב-**Gmail API** במקום SMTP
- הוספתי **פענוח OAuth2 token** (decrypt)
- פורמט המייל ב-**RFC 2822** תקני
- **Base64 URL-safe encoding** לפי דרישות Gmail API
- **Fallback ל-SMTP** אם אין Gmail
- **שגיאות ברורות** אם אין אינטגרציה

**הלוגיקה החדשה:**
```typescript
1. חפש IntegrationConnection עם provider='google'
2. פענח את access_token_encrypted
3. בנה מייל בפורמט RFC 2822
4. קודד Base64 URL-safe
5. שלח דרך Gmail API: POST https://gmail.googleapis.com/gmail/v1/users/me/messages/send
6. אם נכשל - נסה SMTP
7. אם אין כלום - החזר שגיאה ברורה
```

**קובץ:** `functions/sendEmail.ts`

---

### תיקון 3: AutomationDebugger.jsx - כלי דיבאג חדש

**מה זה עושה:**
כלי **אינטראקטיבי** שעוזר לך להבין בדיוק למה אוטומציה לא עובדת.

**תכונות:**

#### טאב "חוקים" (Rules)
- רשימת כל החוקים עם:
  - סטטוס (פעיל/לא פעיל)
  - סטטיסטיקות (כמה פעמים רץ, הצלחות, כישלונות)
  - תנאי CATCH (שולח, נושא, גוף)
- **לחיצה על חוק** = בודק אותו מול **כל המיילים**
- תוצאות:
  - ✅ ירוק = מייל תואם
  - ❌ אפור = מייל לא תואם
  - פירוט מדוייק: למה תאם/לא תאם כל תנאי

#### טאב "מיילים" (Mails)
- רשימת 50 המיילים האחרונים
- **לחיצה על מייל** = בודק אותו מול **כל החוקים**
- תוצאות:
  - איזה חוקים תואמים למייל הזה
  - למה כל חוק תאם/לא תאם

#### טאב "לוגים" (Logs)
- היסטוריית כל ביצועי האוטומציות
- סטטוס: הצלחה/כישלון
- פירוט פעולות:
  - כמה פעולות רצו
  - כמה הצליחו
  - כמה נכשלו
  - כמה ממתינות לאישור
- הודעות שגיאה מפורטות

**איך להגיע:**
אפשר לגשת ל-AutomationDebugger בשתי דרכים:
1. **ידנית:** בדפדפן, שנה את ה-URL ל: `?page=AutomationDebugger`
2. **בקוד:** `navigate(createPageUrl('AutomationDebugger'))`

**קובץ:** `src/pages/AutomationDebugger.jsx`

---

## 🧪 איך לבדוק שהכל עובד

### שלב 1: בדוק את ה-Gmail Integration

```javascript
// פתח Console (F12) והרץ:
base44.entities.IntegrationConnection.list().then(conns => {
  const gmail = conns.find(c => c.provider === 'google');
  console.log('Gmail Integration:', gmail);
  console.log('Is Active:', gmail?.is_active);
  console.log('Has Token:', !!gmail?.access_token_encrypted);
});
```

**מה אמור לראות:**
- `Is Active: true`
- `Has Token: true`

**אם לא:**
- לך ל-Settings → Integrations
- התחבר ל-Gmail (OAuth2)
- תן הרשאות

---

### שלב 2: בדוק שהחוק פעיל

```javascript
base44.entities.AutomationRule.list().then(rules => {
  const activeRules = rules.filter(r => r.is_active);
  console.log('Active Rules:', activeRules.map(r => ({
    name: r.name,
    senders: r.catch_config?.senders,
    subject: r.catch_config?.subject_contains,
    body: r.catch_config?.body_contains,
  })));
});
```

**מה לבדוק:**
- `is_active: true`
- `catch_config` מכיל את התנאים הנכונים

---

### שלב 3: שלח מייל בדיקה

1. **שלח מייל** לתיבת הדואר שמחוברת ל-Gmail Integration
2. **עבור ל-Mail Room**
3. **לחץ "Sync Now"**
4. **וודא שהמייל הופיע**

אם המייל לא מופיע:
- בדוק Console (F12) אם יש שגיאות
- בדוק שה-Gmail Integration פעיל
- נסה שוב Sync

---

### שלב 4: השתמש ב-AutomationDebugger

1. **פתח AutomationDebugger:**
   - שנה URL ל: `?page=AutomationDebugger`

2. **בטאב "מיילים":**
   - **מצא את המייל** שזה עתה שלחת
   - **לחץ עליו**
   - **תראה** אילו חוקים תואמים

3. **אם אף חוק לא תואם:**
   - בדוק את התוצאות המפורטות
   - ראה איזה תנאי CATCH נכשל
   - תקן את החוק בהתאם

4. **אם חוק כן תואם:**
   - עבור ל**טאב "לוגים"**
   - חפש רשומה חדשה של ביצוע
   - אם יש שגיאה - תראה אותה שם

---

### שלב 5: בדוק שהמייל נשלח (אם הפעולה היא send_email)

אם החוק מגדיר `send_email` action:

```javascript
// בדוק אם יש לוג של שליחה
base44.entities.Activity.list('-created_at', 50).then(logs => {
  const emailLogs = logs.filter(l =>
    l.activity_type === 'automation_log' &&
    l.metadata?.actions_summary?.success > 0
  );
  console.log('Email Send Logs:', emailLogs);
});
```

**אם אתה רואה success > 0** אבל המייל לא הגיע:
- בדוק את תיבת הדואר של הנמען
- בדוק Spam/Junk
- בדוק Console logs של ה-sendEmail function

---

## 📋 Checklist לדיבאג אוטומציה

כאשר אוטומציה לא עובדת, עבור על הרשימה הזו:

- [ ] **1. Gmail Integration פעיל?**
  - Settings → Integrations → Google
  - `is_active: true`

- [ ] **2. החוק פעיל?**
  - Settings → Automation Rules
  - וודא שהחוק מסומן ירוק

- [ ] **3. המייל סונכרן?**
  - Mail Room → Sync Now
  - וודא שהמייל מופיע ברשימה

- [ ] **4. תנאי CATCH תואמים?**
  - AutomationDebugger → טאב "מיילים"
  - בחר את המייל ובדוק אם יש חוק תואם

- [ ] **5. החוק רץ?**
  - AutomationDebugger → טאב "לוגים"
  - חפש רשומה עם שם החוק והמייל

- [ ] **6. הפעולות הצליחו?**
  - בלוג, בדוק `actions_summary.success > 0`
  - אם `failed > 0`, תראה את error_message

---

## 🐛 בעיות נפוצות ופתרונות

### בעיה: "Gmail API error: 401"
**סיבה:** הטוקן פג תוקף
**פתרון:**
1. Settings → Integrations
2. נתק את Google
3. התחבר מחדש

---

### בעיה: "No active email integration configured"
**סיבה:** אין IntegrationConnection עם provider='google'
**פתרון:**
1. Settings → Integrations
2. לחץ "Connect Google"
3. תן הרשאות ל-Gmail

---

### בעיה: החוק לא תופס את המייל
**סיבה:** תנאי CATCH לא מדויקים
**פתרון:**
1. פתח AutomationDebugger
2. טאב "מיילים" → בחר את המייל
3. ראה איזה תנאי נכשל
4. תקן את החוק:
   - `senders`: וודא שכתובת השולח מדויקת
   - `subject_contains`: בדוק רישיות (case-sensitive)
   - `body_contains`: וודא שהטקסט קיים בגוף

---

### בעיה: החוק רץ אבל המייל לא נשלח
**סיבה:** פונקציית sendEmail נכשלת
**בדיקה:**
1. AutomationDebugger → טאב "לוגים"
2. חפש את הרשומה האחרונה
3. בדוק error_message

**פתרונות אפשריים:**
- אם `Gmail API error`: הטוקן פג תוקף (התחבר מחדש)
- אם `Missing required fields`: בדוק את ה-template של המייל
- אם `No email integration`: התחבר ל-Gmail

---

## 🎯 סיכום תהליך הדיבאג

```
1. שלח מייל בדיקה
2. Sync Now ב-Mail Room
3. פתח AutomationDebugger
4. טאב "מיילים" → בחר את המייל
5. בדוק אילו חוקים תואמים:
   ✅ יש תאמה? → טאב "לוגים" → בדוק error_message
   ❌ אין תאמה? → בדוק את תנאי CATCH ותקן את החוק
```

---

## 📞 עזרה נוספת

אם משהו לא עובד אחרי כל זה:

1. **פתח Console** (F12)
2. **שכפל את השלבים**
3. **העתק את הלוגים** שמופיעים
4. **שלח לי** את:
   - הלוגים מ-Console
   - צילום מסך מ-AutomationDebugger
   - הגדרת החוק (CATCH + ACTION)
   - דוגמה של מייל שאמור לתפוס

---

**זמינות הכלים החדשים:**
- ✅ MailView.jsx - משודרג עם debug
- ✅ sendEmail.ts - שולח באמת דרך Gmail API
- ✅ AutomationDebugger.jsx - כלי דיבאג אינטראקטיבי

**כל הקבצים מוכנים ופועלים!** 🚀
