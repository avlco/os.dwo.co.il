import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

function getInitials(name) {
  if (!name) return '?';
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

const AVATAR_COLORS = [
  'bg-blue-200 dark:bg-blue-800 text-blue-700 dark:text-blue-200',
  'bg-emerald-200 dark:bg-emerald-800 text-emerald-700 dark:text-emerald-200',
  'bg-purple-200 dark:bg-purple-800 text-purple-700 dark:text-purple-200',
  'bg-amber-200 dark:bg-amber-800 text-amber-700 dark:text-amber-200',
  'bg-rose-200 dark:bg-rose-800 text-rose-700 dark:text-rose-200',
];

export default function AssigneeAvatars({ userIds = [], maxShow = 3, size = 'sm' }) {
  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => base44.entities.User.list(),
  });

  if (!userIds || userIds.length === 0) return null;

  const assignedUsers = userIds
    .map(id => users.find(u => u.id === id))
    .filter(Boolean);

  const visibleUsers = assignedUsers.slice(0, maxShow);
  const extraCount = assignedUsers.length - maxShow;
  const sizeClass = size === 'sm' ? 'h-6 w-6 text-[10px]' : 'h-8 w-8 text-xs';

  return (
    <TooltipProvider>
      <div className="flex -space-x-1.5 rtl:space-x-reverse">
        {visibleUsers.map((user, idx) => (
          <Tooltip key={user.id}>
            <TooltipTrigger asChild>
              <Avatar className={`${sizeClass} border-2 border-white dark:border-slate-800`}>
                <AvatarFallback className={`${sizeClass} ${AVATAR_COLORS[idx % AVATAR_COLORS.length]}`}>
                  {getInitials(user.full_name)}
                </AvatarFallback>
              </Avatar>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="dark:bg-slate-700 dark:text-slate-200">
              <p className="text-xs">{user.full_name}</p>
            </TooltipContent>
          </Tooltip>
        ))}
        {extraCount > 0 && (
          <Avatar className={`${sizeClass} border-2 border-white dark:border-slate-800`}>
            <AvatarFallback className={`${sizeClass} bg-slate-300 dark:bg-slate-600 text-slate-600 dark:text-slate-300`}>
              +{extraCount}
            </AvatarFallback>
          </Avatar>
        )}
      </div>
    </TooltipProvider>
  );
}
