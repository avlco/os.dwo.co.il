import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../components/ThemeProvider';
import { useDateTimeSettings } from '../components/DateTimeSettingsProvider';
import PageHeader from '../components/ui/PageHeader';
import UserManagement from '../components/settings/UserManagement';

import IntegrationsTab from '../components/settings/IntegrationsTab';
import TreeSchemaManager from '../components/settings/TreeSchemaManager';
import DateTimePreferences from '../components/settings/DateTimePreferences';
import {
  User,
  Bell,
  Shield,
  Users,
  Settings as SettingsIcon,
  Link2,
  FolderTree
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

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
  const { t, i18n } = useTranslation();
  const { theme, setTheme } = useTheme();
  const { formatDate, formatDateTime } = useDateTimeSettings();
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState({
    full_name: '',
    phone: '',
  });
  const [notifications, setNotifications] = useState({
    email_new_task: true,
    email_deadline: true,
    email_overdue: true,
    email_frequency: 'immediate',
  });

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
      });
    } catch (e) {
      console.error('Error loading user:', e);
    }
  };

  const handleSaveProfile = async () => {
    try {
      await base44.auth.updateMe(profile);
      alert(t('settings.saved_successfully'));
      loadUser();
    } catch (e) {
      alert(t('settings.save_error'));
    }
  };

  const handleLanguageChange = (lang) => {
    i18n.changeLanguage(lang);
    localStorage.setItem('language', lang);
  };

  const getInitials = (name) => {
    if (!name) return 'U';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('settings.title')}
        subtitle={t('settings.subtitle')}
      />

      <Tabs defaultValue="profile" className="space-y-6">
        <TabsList className="bg-white dark:bg-slate-800 border dark:border-slate-700">
          <TabsTrigger value="profile" className="gap-2 dark:text-slate-300 dark:data-[state=active]:bg-slate-700">
            <User className="w-4 h-4" />
            {t('settings.profile')}
          </TabsTrigger>
          <TabsTrigger value="notifications" className="gap-2 dark:text-slate-300 dark:data-[state=active]:bg-slate-700">
            <Bell className="w-4 h-4" />
            {t('settings.notifications')}
          </TabsTrigger>
          <TabsTrigger value="security" className="gap-2 dark:text-slate-300 dark:data-[state=active]:bg-slate-700">
            <Shield className="w-4 h-4" />
            {t('settings.security')}
          </TabsTrigger>
          <TabsTrigger value="preferences" className="gap-2 dark:text-slate-300 dark:data-[state=active]:bg-slate-700">
            <SettingsIcon className="w-4 h-4" />
            {t('settings.preferences')}
          </TabsTrigger>
          {user?.role === 'admin' && (
            <TabsTrigger value="users" className="gap-2 dark:text-slate-300 dark:data-[state=active]:bg-slate-700">
              <Users className="w-4 h-4" />
              {t('settings.user_management')}
            </TabsTrigger>
          )}

          {user?.role === 'admin' && (
            <TabsTrigger value="folder-structure" className="gap-2 dark:text-slate-300 dark:data-[state=active]:bg-slate-700">
              <FolderTree className="w-4 h-4" />
              מבנה תיקיות
            </TabsTrigger>
          )}
          <TabsTrigger value="integrations" className="gap-2 dark:text-slate-300 dark:data-[state=active]:bg-slate-700">
            <Link2 className="w-4 h-4" />
            אינטגרציות
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <div className="max-w-4xl mx-auto">
          <Card className="dark:bg-slate-800 dark:border-slate-700">
            <CardHeader>
              <CardTitle className="dark:text-slate-100">{t('settings.personal_details')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center gap-6">
                <Avatar className="h-20 w-20">
                  <AvatarFallback className="bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-xl font-medium">
                    {getInitials(user?.full_name)}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-medium text-slate-800 dark:text-slate-200">{user?.full_name}</p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">{user?.email}</p>
                  {user?.role && (
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{t('settings.role')}: {user.role}</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="dark:text-slate-300">{t('settings.full_name')}</Label>
                  <Input
                    value={profile.full_name}
                    onChange={(e) => setProfile({ ...profile, full_name: e.target.value })}
                    className="dark:bg-slate-900 dark:border-slate-600 dark:text-slate-200"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="dark:text-slate-300">{t('settings.phone')}</Label>
                  <Input
                    value={profile.phone}
                    onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                    className="dark:bg-slate-900 dark:border-slate-600 dark:text-slate-200"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="dark:text-slate-300">{t('settings.email_readonly')}</Label>
                <Input value={user?.email} disabled className="dark:bg-slate-900 dark:border-slate-600 dark:text-slate-400" />
              </div>



              <div className="flex justify-end">
                <Button onClick={handleSaveProfile} className="bg-slate-800 hover:bg-slate-700 dark:bg-slate-700 dark:hover:bg-slate-600">
                  {t('common.save_changes')}
                </Button>
              </div>
            </CardContent>
          </Card>
          </div>
        </TabsContent>

        <TabsContent value="notifications">
          <div className="max-w-4xl mx-auto">
          <Card className="dark:bg-slate-800 dark:border-slate-700">
            <CardHeader>
              <CardTitle className="dark:text-slate-100">{t('settings.notification_preferences')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-slate-800 dark:text-slate-200">{t('settings.new_task')}</p>
                    <p className="text-sm text-slate-500 dark:text-slate-400">{t('settings.new_task_desc')}</p>
                  </div>
                  <Switch
                    checked={notifications.email_new_task}
                    onCheckedChange={(checked) => setNotifications({ ...notifications, email_new_task: checked })}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-slate-800 dark:text-slate-200">{t('settings.upcoming_deadline')}</p>
                    <p className="text-sm text-slate-500 dark:text-slate-400">{t('settings.upcoming_deadline_desc')}</p>
                  </div>
                  <Switch
                    checked={notifications.email_deadline}
                    onCheckedChange={(checked) => setNotifications({ ...notifications, email_deadline: checked })}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-slate-800 dark:text-slate-200">{t('settings.overdue_deadline')}</p>
                    <p className="text-sm text-slate-500 dark:text-slate-400">{t('settings.overdue_deadline_desc')}</p>
                  </div>
                  <Switch
                    checked={notifications.email_overdue}
                    onCheckedChange={(checked) => setNotifications({ ...notifications, email_overdue: checked })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="dark:text-slate-300">{t('settings.notification_frequency')}</Label>
                <Select 
                  value={notifications.email_frequency}
                  onValueChange={(v) => setNotifications({ ...notifications, email_frequency: v })}
                >
                  <SelectTrigger className="dark:bg-slate-900 dark:border-slate-600 dark:text-slate-200">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="dark:bg-slate-800 dark:border-slate-700">
                    <SelectItem value="immediate" className="dark:text-slate-200">{t('settings.immediate')}</SelectItem>
                    <SelectItem value="daily" className="dark:text-slate-200">{t('settings.daily')}</SelectItem>
                    <SelectItem value="weekly" className="dark:text-slate-200">{t('settings.weekly')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
          </div>
        </TabsContent>

        <TabsContent value="security">
          <div className="max-w-4xl mx-auto">
          <Card className="dark:bg-slate-800 dark:border-slate-700">
            <CardHeader>
              <CardTitle className="dark:text-slate-100">{t('settings.security_password')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-200 dark:border-blue-800">
                <p className="text-sm text-blue-800 dark:text-blue-300">
                  {t('settings.security_info')}
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <p className="font-medium text-slate-800 dark:text-slate-200 mb-2">{t('settings.last_login')}</p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {user?.last_login_at ? formatDateTime(user.last_login_at) : 'N/A'}
                  </p>
                </div>

                <div>
                  <p className="font-medium text-slate-800 dark:text-slate-200 mb-2">{t('settings.account_created')}</p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {user?.created_date ? formatDate(user.created_date) : 'N/A'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          </div>
        </TabsContent>

        <TabsContent value="preferences">
          <div className="max-w-4xl mx-auto space-y-6">
          <Card className="dark:bg-slate-800 dark:border-slate-700">
            <CardHeader>
              <CardTitle className="dark:text-slate-100">{t('settings.system_preferences')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label className="dark:text-slate-300">{t('settings.language')}</Label>
                <Select 
                  value={i18n.language}
                  onValueChange={handleLanguageChange}
                >
                  <SelectTrigger className="dark:bg-slate-900 dark:border-slate-600 dark:text-slate-200">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="dark:bg-slate-800 dark:border-slate-700">
                    <SelectItem value="he" className="dark:text-slate-200">{t('settings.hebrew')}</SelectItem>
                    <SelectItem value="en" className="dark:text-slate-200">{t('settings.english')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="dark:text-slate-300">{t('settings.theme')}</Label>
                <Select 
                  value={theme}
                  onValueChange={setTheme}
                >
                  <SelectTrigger className="dark:bg-slate-900 dark:border-slate-600 dark:text-slate-200">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="dark:bg-slate-800 dark:border-slate-700">
                    <SelectItem value="light" className="dark:text-slate-200">{t('settings.light')}</SelectItem>
                    <SelectItem value="dark" className="dark:text-slate-200">{t('settings.dark')}</SelectItem>
                    <SelectItem value="auto" className="dark:text-slate-200">{t('settings.auto')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <DateTimePreferences />
          </div>
        </TabsContent>

        <TabsContent value="users">
          <div className="max-w-4xl mx-auto">
            <UserManagement currentUser={user} />
          </div>
        </TabsContent>



        <TabsContent value="folder-structure">
          <div className="max-w-5xl mx-auto">
            <TreeSchemaManager />
          </div>
        </TabsContent>

        <TabsContent value="integrations">
          <div className="max-w-4xl mx-auto">
            <IntegrationsTab user={user} />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}