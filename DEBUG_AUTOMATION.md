# בדיקת אוטומציות - Checklist

## ✅ דברים לבדוק:

### 1. **האם החוק פעיל?**
- [ ] עבור ל-Settings → Automation Rules
- [ ] וודא שהחוק מסומן כ-"Active" (ירוק)

### 2. **האם ה-CATCH תואם?**
```
בדוק שהחוק מוגדר נכון:
- Sender: האם האימייל שהגיע תואם?
- Subject Contains: האם הנושא מכיל את המילה?
- Body Contains: האם הגוף מכיל את הטקסט?
```

### 3. **האם המייל הסתנכרן?**
- [ ] עבור ל-Mail Room
- [ ] לחץ על "Sync Now"
- [ ] וודא שהמייל מופיע ברשימה

### 4. **האם יש שגיאות בקונסול?**
בדפדפן (F12) → Console:
```
חפש הודעות כמו:
- "No matching rules"
- "Rule execution failed"
- "Permission denied"
```

### 5. **האם יש לוגים ב-Activity?**
- [ ] עבור ל-Dashboard
- [ ] חפש בטבלת Activity רשומות מסוג "automation_log"

---

## 🐛 בעיות אפשריות:

### בעיה 1: המייל לא סונכרן
**תסמינים:** המייל לא מופיע ב-Mail Room
**פתרון:** לחץ "Sync Now" ב-Mail Room

### בעיה 2: החוק לא תואם
**תסמינים:** המייל מופיע אבל לא קורה כלום
**פתרון:** בדוק את הגדרות ה-CATCH

### בעיה 3: שגיאה בביצוע
**תסמינים:** החוק רץ אבל נכשל
**פתרון:** בדוק Activity logs

### בעיה 4: הרשאות
**תסמינים:** "Permission denied" בקונסול
**פתרון:** בדוק Security settings ב-Base44

---

## 🧪 איך לבדוק:

### צעד 1: בדוק שהחוק פעיל
```
1. Settings → Automation Rules
2. מצא את החוק שלך
3. וודא שיש לו סטטוס ירוק (Active)
```

### צעד 2: בדוק את ה-CATCH
```
1. לחץ על החוק
2. בדוק:
   - Senders: רשימת אימיילים
   - Subject Contains: מילה בנושא
   - Body Contains: מילה בגוף
```

### צעד 3: שלח מייל בדיקה
```
1. שלח מייל שתואם לחוק
2. לחץ "Sync Now" ב-Mail Room
3. המייל אמור להופיע עם סטטוס "Pending"
```

### צעד 4: בדוק Activity
```javascript
// בקונסול (F12):
localStorage.getItem('base44_access_token') // וודא שיש token

// אז:
// עבור לדף Activity או AutomationMetrics
// חפש רשומות חדשות
```

---

## 📝 מה תראה אם זה עובד:

### במייל:
```
Status: Pending → Processed
```

### ב-Activity:
```
Type: automation_log
Status: completed
Description: [Rule Name] → [Mail Subject]
```

### ב-Actions:
```
- אם זה "Send Email" → המייל נשלח
- אם זה "Create Task" → משימה חדשה נוצרה
- אם זה "Billing" → רשומת זמן נוצרה
```

---

## 🔧 איך לדבג:

### Console Logs:
```javascript
// פתח Console (F12) והרץ:
base44.entities.Activity.list('-created_at', 10).then(logs => {
  console.table(logs.filter(l => l.activity_type === 'automation_log'));
});
```

### בדיקת חוק ספציפי:
```javascript
base44.entities.AutomationRule.list().then(rules => {
  const activeRules = rules.filter(r => r.is_active);
  console.log('Active Rules:', activeRules.map(r => r.name));
});
```

---

## ✅ מה עושים אחרי שמצאנו את הבעיה?

תגיד לי:
1. מה הסטטוס של החוק? (Active/Inactive)
2. איך הגדרת את ה-CATCH?
3. האם המייל הופיע ב-Mail Room?
4. האם יש שגיאות בקונסול?
5. האם יש לוגים ב-Activity?

ואני אדע איך לתקן! 🔧
