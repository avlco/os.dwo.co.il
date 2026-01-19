# How to Fix "Permission Denied" Error

## 🔴 הבעיה
כאשר מנסים ליצור לקוח או תיק, מקבלים שגיאה:
```
Permission denied for create operation on client entity
```

**סיבה:** טבלאות ה-Supabase מוגנות ב-Row Level Security (RLS) אבל אין policies מוגדרים.

---

## ✅ הפתרון - 3 שלבים פשוטים

### **שלב 1: פתח את Supabase Dashboard**

1. גש ל-Supabase Dashboard: https://app.supabase.com
2. בחר את הפרויקט שלך
3. לחץ על **SQL Editor** בתפריט הצד (סמל </>)

### **שלב 2: הרץ את קובץ ה-SQL**

1. פתח את הקובץ: **`SUPABASE_RLS_POLICIES.sql`** (נמצא בשורש הפרויקט)
2. **העתק את כל התוכן** (Ctrl+A → Ctrl+C)
3. **הדבק** ב-SQL Editor בSupabase
4. לחץ על **"RUN"** (או Ctrl+Enter)

### **שלב 3: בדוק שזה עבד**

הרץ את השאילתה הזו ב-SQL Editor:

```sql
SELECT schemaname, tablename, policyname
FROM pg_policies
WHERE tablename IN ('Client', 'Case')
ORDER BY tablename, policyname;
```

**אמור לראות:** רשימה של policies (לפחות 4 לכל טבלה: SELECT, INSERT, UPDATE, DELETE)

---

## 🧪 בדיקה

עכשיו נסה שוב:
1. פתח את האפליקציה
2. נסה ליצור לקוח חדש
3. צריך לעבוד! ✅

---

## ⚙️ מה ה-SQL עשה?

הקובץ יצר **RLS Policies** שמאפשרים למשתמשים מאומתים:
- ✅ לקרוא את כל הלקוחות והתיקים
- ✅ ליצור לקוחות ותיקים חדשים
- ✅ לעדכן לקוחות ותיקים קיימים
- ✅ למחוק (soft delete) לקוחות ותיקים

**רק Admin** יכול:
- 🔒 לנהל משתמשים
- 🔒 לנהל חוקי אוטומציה

---

## ❓ שאלות נפוצות

### **Q: למה צריך RLS?**
A: Supabase מגן על הנתונים שלך. בלי policies, אף אחד לא יכול לגשת לנתונים (גם משתמשים מאומתים).

### **Q: האם זה בטוח?**
A: כן! המדיניות מוודאת שרק משתמשים מאומתים יכולים לגשת לנתונים. אם תרצה הגבלות נוספות (למשל: עורך דין רואה רק את התיקים שלו), נוכל להוסיף אותן.

### **Q: אני לא רוצה שכולם יראו הכל**
A: אפשר להגביל! למשל, רק תיקים שמוקצים לי:

```sql
CREATE POLICY "Users see only their assigned cases"
ON "Case"
FOR SELECT
TO authenticated
USING (assigned_lawyer_id = auth.uid());
```

### **Q: אני רוצה שרק Admin יוכל ליצור לקוחות**
A: אפשר לשנות את ה-policy:

```sql
-- Replace the existing "create clients" policy with:
DROP POLICY IF EXISTS "Allow authenticated users to create clients" ON "Client";

CREATE POLICY "Only admins can create clients"
ON "Client"
FOR INSERT
TO authenticated
WITH CHECK (
  auth.jwt() ->> 'role' = 'admin'
  OR
  auth.jwt() ->> 'user_metadata' ->> 'role' = 'admin'
);
```

---

## 🚨 אם זה עדיין לא עובד

### בדיקה 1: וודא שאתה מחובר
```javascript
// בConsole של הדפדפן (F12)
localStorage.getItem('base44_access_token')
// צריך להחזיר token (לא null)
```

### בדיקה 2: בדוק את הטוקן ב-Supabase
ב-SQL Editor:
```sql
SELECT * FROM auth.users;
```
צריך לראות את המשתמש שלך.

### בדיקה 3: בדוק שה-policies קיימים
```sql
SELECT * FROM pg_policies WHERE tablename = 'Client';
```
צריך לראות 4 policies.

---

## 📞 עזרה נוספת?

אם משהו לא עובד, הפעל את הפקודה הזו ושלח לי את הפלט:

```sql
-- בדיקת סטטוס RLS
SELECT
    schemaname,
    tablename,
    rowsecurity AS "RLS Enabled?"
FROM pg_tables
WHERE tablename IN ('Client', 'Case', 'Task', 'Deadline')
ORDER BY tablename;

-- בדיקת policies
SELECT
    tablename,
    policyname,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies
WHERE tablename IN ('Client', 'Case')
ORDER BY tablename, cmd;
```

---

**מצב לאחר התיקון:**
- ✅ לקוחות: ניתן ליצור, לערוך, לסמן כלא פעיל
- ✅ תיקים: ניתן ליצור, לערוך, למחוק
- ✅ מספר לקוח: שדה חובה
- ✅ פרטי התקשרות: חובה לפחות אימייל או טלפון
- ✅ נושא התיק: label מותאם לקניין רוחני
