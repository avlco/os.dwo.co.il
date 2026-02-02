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
import { Badge } from "@/components/ui/badge";
import { UserPlus, Mail, Shield, Users } from 'lucide-react';

export default function UserManagement({ currentUser }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('user');

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => base44.entities.User.list(),
    enabled: currentUser?.role === 'admin',
  });

  const inviteUserMutation = useMutation({
    mutationFn: ({ email, role }) => base44.users.inviteUser(email, role),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setInviteEmail('');
      setInviteRole('user');
      alert(t('settings.user_invited'));
    },
    onError: () => {
      alert(t('settings.invite_error'));
    },
  });

  const handleInvite = (e) => {
    e.preventDefault();
    if (!inviteEmail) return;
    inviteUserMutation.mutate({ email: inviteEmail, role: inviteRole });
  };

  if (currentUser?.role !== 'admin') {
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
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button 
              type="submit" 
              disabled={inviteUserMutation.isPending}
              className="bg-slate-800 hover:bg-slate-700 dark:bg-slate-700 dark:hover:bg-slate-600"
            >
              <Mail className="w-4 h-4 mr-2" />
              {t('settings.send_invitation')}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="dark:bg-slate-800 dark:border-slate-700">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 dark:text-slate-100">
            <Users className="w-5 h-5" />
            {t('settings.existing_users')}
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
                  className="flex items-center justify-between p-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50"
                >
                  <div>
                    <p className="font-medium text-slate-800 dark:text-slate-200">{user.full_name}</p>
                    <p className="text-sm text-slate-500 dark:text-slate-400">{user.email}</p>
                  </div>
                  <Badge 
                    variant={user.role === 'admin' ? 'default' : 'secondary'}
                    className={user.role === 'admin' ? 'bg-slate-800 dark:bg-slate-700' : 'dark:bg-slate-700'}
                  >
                    {user.role === 'admin' ? t('settings.admin_role') : t('settings.user_role')}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}