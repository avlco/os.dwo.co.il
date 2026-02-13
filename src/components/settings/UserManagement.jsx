import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { UserPlus, Mail, Shield, Users, Pencil, UserX, UserCheck } from 'lucide-react';
import { useToast } from "@/components/ui/use-toast";

const ROLES = ['user', 'admin', 'partner'];
const PROFESSIONAL_TITLES = ['attorney', 'paralegal', 'secretary', 'accountant', 'intern', 'other'];

export default function UserManagement({ currentUser }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('user');
  const [editUser, setEditUser] = useState(null);
  const [editForm, setEditForm] = useState({});

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => base44.entities.User.list(),
    enabled: currentUser?.role === 'admin' || currentUser?.role === 'partner',
  });

  const inviteUserMutation = useMutation({
    mutationFn: ({ email, role }) => base44.users.inviteUser(email, role),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setInviteEmail('');
      setInviteRole('user');
      toast({ title: t('settings.user_invited', 'ההזמנה נשלחה בהצלחה') });
    },
    onError: (err) => {
      toast({ variant: 'destructive', title: t('settings.invite_error', 'שגיאה בשליחת הזמנה'), description: err.message });
    },
  });

  const updateUserMutation = useMutation({
    mutationFn: ({ userId, data }) => base44.entities.User.update(userId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setEditUser(null);
      toast({ title: t('user_management.user_updated', 'המשתמש עודכן בהצלחה') });
    },
    onError: (err) => {
      toast({ variant: 'destructive', title: t('common.error', 'שגיאה'), description: err.message });
    },
  });

  const handleInvite = (e) => {
    e.preventDefault();
    if (!inviteEmail) return;
    inviteUserMutation.mutate({ email: inviteEmail, role: inviteRole });
  };

  const openEditDialog = (user) => {
    setEditUser(user);
    setEditForm({
      full_name: user.full_name || '',
      phone: user.phone || '',
      professional_title: user.professional_title || '',
      role: user.role || 'user',
    });
  };

  const handleEditSave = () => {
    if (!editUser) return;
    updateUserMutation.mutate({ userId: editUser.id, data: editForm });
  };

  const handleToggleActive = (user) => {
    const newStatus = user.is_active === false;
    const confirmMsg = newStatus
      ? t('user_management.confirm_activate', 'להפעיל משתמש זה?')
      : t('user_management.confirm_deactivate', 'להשבית משתמש זה? הוא לא יוכל להתחבר.');
    if (!confirm(confirmMsg)) return;
    updateUserMutation.mutate({ userId: user.id, data: { is_active: newStatus } });
  };

  const getRoleBadge = (role) => {
    const roleConfig = {
      admin: { label: t('settings.admin_role'), className: 'bg-slate-800 text-white dark:bg-slate-600' },
      partner: { label: t('user_management.partner_role', 'שותף'), className: 'bg-indigo-600 text-white dark:bg-indigo-700' },
      user: { label: t('settings.user_role'), className: 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300' },
    };
    const config = roleConfig[role] || roleConfig.user;
    return <Badge className={config.className}>{config.label}</Badge>;
  };

  const getProfessionalTitle = (title) => {
    if (!title) return '';
    return t(`user_management.title_${title}`, title);
  };

  if (currentUser?.role !== 'admin' && currentUser?.role !== 'partner') {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="text-center">
            <Shield className="w-12 h-12 mx-auto text-slate-400 dark:text-slate-600 mb-4" />
            <p className="text-slate-600 dark:text-slate-400">{t('settings.admin_only')}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Invite Users Card */}
      <Card className="dark:bg-slate-800 dark:border-slate-700">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 dark:text-slate-100">
            <UserPlus className="w-5 h-5" />
            {t('settings.invite_users')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleInvite} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="dark:text-slate-300">{t('settings.invite_email')}</Label>
                <Input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="user@example.com"
                  required
                  className="dark:bg-slate-800 dark:border-slate-700"
                />
              </div>
              <div className="space-y-2">
                <Label className="dark:text-slate-300">{t('settings.invite_role')}</Label>
                <Select value={inviteRole} onValueChange={setInviteRole}>
                  <SelectTrigger className="dark:bg-slate-900 dark:border-slate-600 dark:text-slate-200">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="dark:bg-slate-800 dark:border-slate-700">
                    <SelectItem value="user" className="dark:text-slate-200">{t('settings.user_role')}</SelectItem>
                    <SelectItem value="admin" className="dark:text-slate-200">{t('settings.admin_role')}</SelectItem>
                    <SelectItem value="partner" className="dark:text-slate-200">{t('user_management.partner_role', 'שותף')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button
              type="submit"
              disabled={inviteUserMutation.isPending}
              className="bg-slate-800 hover:bg-slate-700 dark:bg-slate-700 dark:hover:bg-slate-600"
            >
              <Mail className="w-4 h-4 ltr:mr-2 rtl:ml-2" />
              {t('settings.send_invitation')}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Existing Users Card */}
      <Card className="dark:bg-slate-800 dark:border-slate-700">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 dark:text-slate-100">
            <Users className="w-5 h-5" />
            {t('settings.existing_users')} ({users.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-slate-500 dark:text-slate-400">{t('common.loading')}</div>
          ) : (
            <div className="space-y-3">
              {users.map((user) => (
                <div
                  key={user.id}
                  className={`flex items-center justify-between p-4 rounded-lg border ${
                    user.is_active === false
                      ? 'border-red-200 dark:border-red-900/30 bg-red-50/50 dark:bg-red-900/10 opacity-60'
                      : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50'
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-slate-800 dark:text-slate-200">{user.full_name}</p>
                      {user.professional_title && (
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          ({getProfessionalTitle(user.professional_title)})
                        </span>
                      )}
                      {user.is_active === false && (
                        <Badge variant="outline" className="text-xs text-red-500 border-red-300 dark:border-red-800">
                          {t('user_management.inactive', 'מושבת')}
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-slate-500 dark:text-slate-400">{user.email}</p>
                    {user.phone && (
                      <p className="text-xs text-slate-400 dark:text-slate-500">{user.phone}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {getRoleBadge(user.role)}
                    {currentUser?.role === 'admin' && user.id !== currentUser.id && (
                      <>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => openEditDialog(user)}
                        >
                          <Pencil className="w-4 h-4 text-slate-500" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => handleToggleActive(user)}
                        >
                          {user.is_active === false ? (
                            <UserCheck className="w-4 h-4 text-green-500" />
                          ) : (
                            <UserX className="w-4 h-4 text-red-500" />
                          )}
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit User Dialog */}
      <Dialog open={!!editUser} onOpenChange={(open) => !open && setEditUser(null)}>
        <DialogContent className="max-w-md dark:bg-slate-800 dark:border-slate-700">
          <DialogHeader>
            <DialogTitle className="dark:text-slate-100">
              {t('user_management.edit_user', 'עריכת משתמש')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="dark:text-slate-300">{t('user_management.full_name', 'שם מלא')}</Label>
              <Input
                value={editForm.full_name || ''}
                onChange={(e) => setEditForm({ ...editForm, full_name: e.target.value })}
                className="dark:bg-slate-900 dark:border-slate-600"
              />
            </div>
            <div className="space-y-2">
              <Label className="dark:text-slate-300">{t('user_management.phone', 'טלפון')}</Label>
              <Input
                value={editForm.phone || ''}
                onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                className="dark:bg-slate-900 dark:border-slate-600"
              />
            </div>
            <div className="space-y-2">
              <Label className="dark:text-slate-300">{t('user_management.professional_title', 'תפקיד מקצועי')}</Label>
              <Select
                value={editForm.professional_title || ''}
                onValueChange={(val) => setEditForm({ ...editForm, professional_title: val })}
              >
                <SelectTrigger className="dark:bg-slate-900 dark:border-slate-600 dark:text-slate-200">
                  <SelectValue placeholder={t('user_management.select_title', 'בחר תפקיד')} />
                </SelectTrigger>
                <SelectContent className="dark:bg-slate-800 dark:border-slate-700">
                  {PROFESSIONAL_TITLES.map(title => (
                    <SelectItem key={title} value={title} className="dark:text-slate-200">
                      {t(`user_management.title_${title}`, title)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="dark:text-slate-300">{t('settings.invite_role', 'תפקיד')}</Label>
              <Select
                value={editForm.role || 'user'}
                onValueChange={(val) => setEditForm({ ...editForm, role: val })}
              >
                <SelectTrigger className="dark:bg-slate-900 dark:border-slate-600 dark:text-slate-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="dark:bg-slate-800 dark:border-slate-700">
                  {ROLES.map(r => (
                    <SelectItem key={r} value={r} className="dark:text-slate-200">
                      {r === 'admin' ? t('settings.admin_role') : r === 'partner' ? t('user_management.partner_role', 'שותף') : t('settings.user_role')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setEditUser(null)} className="dark:border-slate-600">
                {t('common.cancel', 'ביטול')}
              </Button>
              <Button
                onClick={handleEditSave}
                disabled={updateUserMutation.isPending}
                className="bg-slate-800 hover:bg-slate-700 dark:bg-slate-600 dark:hover:bg-slate-500"
              >
                {t('common.save', 'שמור')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
