import React from 'react';
import { Button } from "@/components/ui/button";
import { Plus } from 'lucide-react';

export function PageHeader({ title, subtitle, action, actionLabel, actionIcon: ActionIcon = Plus }) {
  return (
    <div className="flex items-center justify-between mb-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 tracking-tight">{title}</h1>
        {subtitle && <p className="text-slate-500 mt-1">{subtitle}</p>}
      </div>
      {action && (
        <Button 
          onClick={action}
          className="bg-slate-800 hover:bg-slate-700 text-white gap-2 rounded-xl px-5 shadow-sm"
        >
          <ActionIcon className="w-4 h-4" />
          {actionLabel}
        </Button>
      )}
    </div>
  );
}

export default PageHeader;