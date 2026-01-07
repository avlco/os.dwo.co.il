import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

const translations = {
  he: {
    translation: {
      app_name: "IPMS",
      nav: {
        dashboard: "לוח בקרה",
        mail_room: "חדר דואר",
        cases: "תיקים",
        clients: "לקוחות",
        docketing: "יומן",
        tasks: "משימות",
        financials: "כספים",
        settings: "הגדרות",
        mail_rules: "חוקי דואר",
        logout: "התנתק"
      },
      common: {
        search: "חיפוש תיקים, לקוחות...",
        loading: "טוען...",
        save_changes: "שמור שינויים"
      },
      settings: {
        title: "הגדרות",
        subtitle: "ניהול פרופיל והעדפות מערכת",
        profile: "פרופיל",
        notifications: "התראות",
        security: "אבטחה",
        preferences: "העדפות",
        user_management: "ניהול משתמשים",
        personal_details: "פרטים אישיים",
        full_name: "שם מלא",
        phone: "טלפון",
        email_readonly: "אימייל (לקריאה בלבד)",
        signature: "חתימת מייל",
        signature_placeholder: "הוסף חתימה למיילים יוצאים...",
        role: "תפקיד",
        notification_preferences: "העדפות התראות",
        new_task: "משימה חדשה",
        new_task_desc: "קבל התראה כשמשימה חדשה משויכת אליך",
        upcoming_deadline: "מועד קרוב",
        upcoming_deadline_desc: "קבל תזכורת למועדים קרובים",
        overdue_deadline: "מועד באיחור",
        overdue_deadline_desc: "קבל התראה על מועדים שעברו",
        notification_frequency: "תדירות התראות",
        immediate: "מיידי",
        daily: "סיכום יומי",
        weekly: "סיכום שבועי",
        security_password: "אבטחה וסיסמה",
        security_info: "לשינוי סיסמה או הגדרות אבטחה נוספות, אנא פנה למנהל המערכת או השתמש במערכת האימות של Base44.",
        last_login: "התחברות אחרונה",
        account_created: "תאריך יצירת חשבון",
        system_preferences: "העדפות מערכת",
        language: "שפה",
        hebrew: "עברית",
        english: "English",
        theme: "ערכת נושא",
        light: "בהיר",
        dark: "כהה",
        auto: "אוטומטי",
        saved_successfully: "השינויים נשמרו בהצלחה",
        save_error: "שגיאה בשמירת השינויים",
        invite_users: "הזמנת משתמשים",
        invite_user: "הזמן משתמש",
        invite_email: "אימייל משתמש",
        invite_role: "תפקיד",
        user_role: "משתמש",
        admin_role: "מנהל",
        send_invitation: "שלח הזמנה",
        existing_users: "משתמשים קיימים",
        user_invited: "המשתמש הוזמן בהצלחה",
        invite_error: "שגיאה בהזמנת המשתמש",
        admin_only: "פעולה זו זמינה למנהלי מערכת בלבד"
      },
      wizard: {
        title: "אשף הגדרת חוקים",
        step: "שלב {{current}} מתוך {{total}}",
        select_template: "בחר את סוג המיילים שברצונך לעבד אוטומטית",
        review_settings: "בדוק את שם החוק והגדרות הזיהוי",
        select_actions: "בחר את הפעולות שיבוצעו כשמייל מתאים יזוהה",
        rule_name: "שם החוק",
        detection_conditions: "תנאי זיהוי (מוגדרים מראש)",
        sender: "שולח",
        subject: "נושא",
        previous: "הקודם",
        next: "הבא",
        close: "סגור",
        create_rule: "צור חוק"
      },
      case_view: {
        documents: "מסמכים",
        dropbox_documents: "מסמכים מ-Dropbox",
        no_documents: "לא נמצאו מסמכים מועלים",
        documents_hint: "מסמכים שיועלו ל-Dropbox דרך המערכת יופיעו כאן"
      }
    }
  },
  en: {
    translation: {
      app_name: "IPMS",
      nav: {
        dashboard: "Dashboard",
        mail_room: "Mail Room",
        cases: "Cases",
        clients: "Clients",
        docketing: "Docketing",
        tasks: "Tasks",
        financials: "Financials",
        settings: "Settings",
        mail_rules: "Mail Rules",
        logout: "Logout"
      },
      common: {
        search: "Search cases, clients...",
        loading: "Loading...",
        save_changes: "Save Changes"
      },
      settings: {
        title: "Settings",
        subtitle: "Manage profile and system preferences",
        profile: "Profile",
        notifications: "Notifications",
        security: "Security",
        preferences: "Preferences",
        user_management: "User Management",
        personal_details: "Personal Details",
        full_name: "Full Name",
        phone: "Phone",
        email_readonly: "Email (Read Only)",
        signature: "Email Signature",
        signature_placeholder: "Add signature for outgoing emails...",
        role: "Role",
        notification_preferences: "Notification Preferences",
        new_task: "New Task",
        new_task_desc: "Get notified when a new task is assigned to you",
        upcoming_deadline: "Upcoming Deadline",
        upcoming_deadline_desc: "Get reminders for upcoming deadlines",
        overdue_deadline: "Overdue Deadline",
        overdue_deadline_desc: "Get notified about overdue deadlines",
        notification_frequency: "Notification Frequency",
        immediate: "Immediate",
        daily: "Daily Summary",
        weekly: "Weekly Summary",
        security_password: "Security & Password",
        security_info: "To change your password or additional security settings, please contact the system administrator or use Base44's authentication system.",
        last_login: "Last Login",
        account_created: "Account Created",
        system_preferences: "System Preferences",
        language: "Language",
        hebrew: "עברית",
        english: "English",
        theme: "Theme",
        light: "Light",
        dark: "Dark",
        auto: "Auto",
        saved_successfully: "Changes saved successfully",
        save_error: "Error saving changes",
        invite_users: "Invite Users",
        invite_user: "Invite User",
        invite_email: "User Email",
        invite_role: "Role",
        user_role: "User",
        admin_role: "Admin",
        send_invitation: "Send Invitation",
        existing_users: "Existing Users",
        user_invited: "User invited successfully",
        invite_error: "Error inviting user",
        admin_only: "This action is available to system administrators only"
      },
      wizard: {
        title: "Rule Setup Wizard",
        step: "Step {{current}} of {{total}}",
        select_template: "Select the type of emails you want to process automatically",
        review_settings: "Review the rule name and detection settings",
        select_actions: "Select the actions to perform when a matching email is detected",
        rule_name: "Rule Name",
        detection_conditions: "Detection Conditions (Pre-configured)",
        sender: "Sender",
        subject: "Subject",
        previous: "Previous",
        next: "Next",
        close: "Close",
        create_rule: "Create Rule"
      },
      case_view: {
        documents: "Documents",
        dropbox_documents: "Dropbox Documents",
        no_documents: "No uploaded documents found",
        documents_hint: "Documents uploaded to Dropbox via the system will appear here"
      }
    }
  }
};

i18n
  .use(initReactI18next)
  .init({
    resources: translations,
    lng: localStorage.getItem('language') || 'he',
    fallbackLng: 'he',
    interpolation: {
      escapeValue: false
    }
  });

export default i18n;