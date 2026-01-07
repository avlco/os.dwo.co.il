import React from 'react';
import { Button } from "@/components/ui/button";
import { Plus } from 'lucide-react';

export default function EmptyState({ icon: Icon, title, description, actionLabel, onAction }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      {Icon && (
        <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-6">
          <Icon className="w-8 h-8 text-slate-400" />
        </div>
      )}
      <h3 className="text-lg font-semibold text-slate-800 mb-2">{title}</h3>
      {description && <p className="text-slate-500 text-center max-w-md mb-6">{description}</p>}
      {onAction && actionLabel && (
        <Button 
          onClick={onAction}
          className="bg-slate-800 hover:bg-slate-700 text-white gap-2 rounded-xl"
        >
          <Plus className="w-4 h-4" />
          {actionLabel}
        </Button>
      )}
    </div>
  );
}