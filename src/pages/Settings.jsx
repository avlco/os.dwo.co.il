import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { format } from 'date-fns';
import PageHeader from '../components/ui/PageHeader';
import {
  User,
  Bell,
  Shield,
  Users,
  UserPlus,
  Mail,
  Settings as SettingsIcon
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export default function Settings() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState({
    full_name: '',
    phone: '',
    signature: '',
  });
  const [preferences, setPreferences] = useState({
    language: 'he',
    theme: 'light',
  });
  const [notifications, setNotifications] = useState({
    email_new_task: true,
    email_deadline: true,
    email_overdue: true,
    email_frequency: 'immediate',
  });
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('user');
  const [inviting, setInviting] = useState(false);

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      const userData = await base44.auth.me();
      setUser(userData);
      setProfile({
        full_name: userData.full_name || '',
        phone: userData.phone || '',
        signature: userData.signature || '',
      });
      setPreferences({
        language: userData.language || 'he',
        theme: userData.theme || 'light',
      });
    } catch (e) {
      console.error('Error loading user:', e);
    }
  };

  const handleSaveProfile = async () => {
    try {
      await base44.auth.updateMe(profile);
      alert('הפרופיל עודכן בהצלחה');
      loadUser();
    } catch (e) {
      alert('שגיאה בשמירת הפרופיל');
    }
  };

  const handleSavePreferences = async () => {
    try {
      await base44.auth.updateMe(preferences);
      
      // Apply theme
      if (preferences.theme === 'dark') {
        document.documentElement.classList.add('dark');
      } else if (preferences.theme === 'light') {
        document.documentElement.classList.remove('dark');
      } else {
        // auto - check system preference
        if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
          document.documentElement.classList.add('dark');
        } else {
          document.documentElement.classList.remove('dark');
        }
      }
      
      alert('ההעדפות עודכנו בהצלחה');
    } catch (e) {
      alert('שגיאה בשמירת ההעדפות');
    }
  };

  const handleInviteUser = async () => {
    if (!inviteEmail) {
      alert('נא להזין כתובת אימייל');
      return;
    }
    
    setInviting(true);
    try {
      await base44.users.inviteUser(inviteEmail, inviteRole);
      alert('המשתמש הוזמן בהצלחה');
      setInviteEmail('');
      setInviteRole('user');
    } catch (e) {
      alert('שגיאה בהזמנת משתמש: ' + e.message);
    } finally {
      setInviting(false);
    }
  };

  const getInitials = (name) => {
    if (!name) return 'U';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="הגדרות"
        subtitle="ניהול פרופיל והעדפות מערכת"
      />

      <Tabs defaultValue="profile" className="space-y-6">
        <TabsList className="bg-white border">
          <TabsTrigger value="profile" className="gap-2">
            <User className="w-4 h-4" />
            פרופיל
          </TabsTrigger>
          <TabsTrigger value="notifications" className="gap-2">
            <Bell className="w-4 h-4" />
            התראות
          </TabsTrigger>
          <TabsTrigger value="security" className="gap-2">
            <Shield className="w-4 h-4" />
            אבטחה
          </TabsTrigger>
          <TabsTrigger value="preferences" className="gap-2">
            <SettingsIcon className="w-4 h-4" />
            העדפות
          </TabsTrigger>
          <TabsTrigger value="users" className="gap-2">
            <Users className="w-4 h-4" />
            משתמשים
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <Card>
            <CardHeader>
              <CardTitle>פרטים אישיים</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center gap-6">
                <Avatar className="h-20 w-20">
                  <AvatarFallback className="bg-slate-200 text-slate-600 text-xl font-medium">
                    {getInitials(user?.full_name)}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-medium text-slate-800">{user?.full_name}</p>
                  <p className="text-sm text-slate-500">{user?.email}</p>
                  {user?.role && (
                    <p className="text-sm text-slate-500 mt-1">תפקיד: {user.role}</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>שם מלא</Label>
                  <Input
                    value={profile.full_name}
                    onChange={(e) => setProfile({ ...profile, full_name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>טלפון</Label>
                  <Input
                    value={profile.phone}
                    onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>אימייל (לקריאה בלבד)</Label>
                <Input value={user?.email} disabled />
              </div>

              <div className="space-y-2">
                <Label>חתימת מייל</Label>
                <Textarea
                  value={profile.signature}
                  onChange={(e) => setProfile({ ...profile, signature: e.target.value })}
                  rows={4}
                  placeholder="הוסף חתימה למיילים יוצאים..."
                />
              </div>

              <div className="flex justify-end">
                <Button onClick={handleSaveProfile} className="bg-slate-800">
                  שמור שינויים
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notifications">
          <Card>
            <CardHeader>
              <CardTitle>העדפות התראות</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-slate-800">משימה חדשה</p>
                    <p className="text-sm text-slate-500">קבל התראה כשמשימה חדשה משויכת אליך</p>
                  </div>
                  <Switch
                    checked={notifications.email_new_task}
                    onCheckedChange={(checked) => setNotifications({ ...notifications, email_new_task: checked })}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-slate-800">מועד קרוב</p>
                    <p className="text-sm text-slate-500">קבל תזכורת למועדים קרובים</p>
                  </div>
                  <Switch
                    checked={notifications.email_deadline}
                    onCheckedChange={(checked) => setNotifications({ ...notifications, email_deadline: checked })}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-slate-800">מועד באיחור</p>
                    <p className="text-sm text-slate-500">קבל התראה על מועדים שעברו</p>
                  </div>
                  <Switch
                    checked={notifications.email_overdue}
                    onCheckedChange={(checked) => setNotifications({ ...notifications, email_overdue: checked })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>תדירות התראות</Label>
                <Select 
                  value={notifications.email_frequency}
                  onValueChange={(v) => setNotifications({ ...notifications, email_frequency: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="immediate">מיידי</SelectItem>
                    <SelectItem value="daily">סיכום יומי</SelectItem>
                    <SelectItem value="weekly">סיכום שבועי</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security">
          <Card>
            <CardHeader>
              <CardTitle>אבטחה וסיסמה</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="p-4 bg-blue-50 rounded-xl border border-blue-200">
                <p className="text-sm text-blue-800">
                  לשינוי סיסמה או הגדרות אבטחה נוספות, אנא פנה למנהל המערכת או השתמש במערכת האימות של Base44.
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <p className="font-medium text-slate-800 mb-2">התחברות אחרונה</p>
                  <p className="text-sm text-slate-500">
                    {user?.last_login_at ? format(new Date(user.last_login_at), 'dd/MM/yyyy HH:mm') : 'לא זמין'}
                  </p>
                </div>

                <div>
                  <p className="font-medium text-slate-800 mb-2">תאריך יצירת חשבון</p>
                  <p className="text-sm text-slate-500">
                    {user?.created_date ? format(new Date(user.created_date), 'dd/MM/yyyy') : 'לא זמין'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="preferences">
          <Card>
            <CardHeader>
              <CardTitle>העדפות מערכת</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label>שפה</Label>
                <Select 
                  value={preferences.language}
                  onValueChange={(v) => setPreferences({ ...preferences, language: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="he">עברית</SelectItem>
                    <SelectItem value="en">English</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>ערכת נושא</Label>
                <Select 
                  value={preferences.theme}
                  onValueChange={(v) => setPreferences({ ...preferences, theme: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="light">בהיר</SelectItem>
                    <SelectItem value="dark">כהה</SelectItem>
                    <SelectItem value="auto">אוטומטי</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex justify-end">
                <Button onClick={handleSavePreferences} className="bg-slate-800">
                  שמור שינויים
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="users">
          <Card>
            <CardHeader>
              <CardTitle>צירוף והרשאות משתמשים</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="p-4 bg-blue-50 rounded-xl border border-blue-200">
                <p className="text-sm text-blue-800">
                  הזמן משתמשים חדשים למערכת. הם יקבלו מייל הזמנה עם קישור להצטרפות.
                </p>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>כתובת אימייל</Label>
                  <Input
                    type="email"
                    placeholder="user@example.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label>תפקיד</Label>
                  <Select value={inviteRole} onValueChange={setInviteRole}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="user">משתמש רגיל</SelectItem>
                      <SelectItem value="admin">מנהל</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Button 
                  onClick={handleInviteUser} 
                  disabled={inviting}
                  className="w-full bg-slate-800 gap-2"
                >
                  <UserPlus className="w-4 h-4" />
                  {inviting ? 'שולח הזמנה...' : 'הזמן משתמש'}
                </Button>
              </div>

              <div className="pt-6 border-t">
                <p className="text-sm text-slate-500 mb-4">
                  <strong>הבדלים בין תפקידים:</strong>
                </p>
                <div className="space-y-2 text-sm text-slate-600">
                  <p>• <strong>מנהל:</strong> גישה מלאה לכל התיקים, הלקוחות והמשימות. יכול לנהל משתמשים.</p>
                  <p>• <strong>משתמש רגיל:</strong> גישה לתיקים ומשימות שהוקצו לו.</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}