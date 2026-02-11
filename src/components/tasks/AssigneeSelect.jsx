import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Check, X, ChevronDown } from 'lucide-react';
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";

function getInitials(name) {
  if (!name) return '?';
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

export default function AssigneeSelect({ value = [], onChange }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => base44.entities.User.list(),
  });

  const toggleUser = (userId) => {
    if (value.includes(userId)) {
      onChange(value.filter(id => id !== userId));
    } else {
      onChange([...value, userId]);
    }
  };

  const removeUser = (userId, e) => {
    e.stopPropagation();
    onChange(value.filter(id => id !== userId));
  };

  const selectedUsers = users.filter(u => value.includes(u.id));

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="w-full justify-between min-h-[40px] h-auto dark:bg-slate-900 dark:border-slate-600"
        >
          <div className="flex flex-wrap gap-1 flex-1">
            {selectedUsers.length === 0 ? (
              <span className="text-slate-400 dark:text-slate-500">{t('tasks_page.select_assignee')}</span>
            ) : (
              selectedUsers.map(user => (
                <Badge
                  key={user.id}
                  variant="secondary"
                  className="gap-1 dark:bg-slate-700 dark:text-slate-200"
                >
                  {user.full_name}
                  <X
                    className="w-3 h-3 cursor-pointer hover:text-rose-500"
                    onClick={(e) => removeUser(user.id, e)}
                  />
                </Badge>
              ))
            )}
          </div>
          <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2 dark:bg-slate-800 dark:border-slate-700" align="start">
        <div className="space-y-1 max-h-48 overflow-y-auto">
          {users.map(user => {
            const isSelected = value.includes(user.id);
            return (
              <button
                key={user.id}
                onClick={() => toggleUser(user.id)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                  isSelected
                    ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                    : 'hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200'
                }`}
              >
                <Avatar className="h-7 w-7">
                  <AvatarFallback className="text-xs bg-slate-200 dark:bg-slate-600">
                    {getInitials(user.full_name)}
                  </AvatarFallback>
                </Avatar>
                <span className="flex-1 text-start truncate">{user.full_name}</span>
                {isSelected && <Check className="w-4 h-4 text-blue-600 dark:text-blue-400" />}
              </button>
            );
          })}
          {users.length === 0 && (
            <p className="text-center text-sm text-slate-400 py-4">{t('common.loading')}</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
