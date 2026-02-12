import React, { useState, useMemo } from 'react';
import { Check, X, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from '@/components/ui/command';

export default function SearchableMultiSelect({
  value = [],
  onValueChange,
  options = [],
  placeholder = 'Select...',
  searchPlaceholder = 'Search...',
  emptyMessage = 'No results found',
  className,
}) {
  const [open, setOpen] = useState(false);

  const selectedOptions = useMemo(
    () => options.filter(opt => value.includes(opt.value)),
    [options, value]
  );

  const toggleValue = (val) => {
    if (value.includes(val)) {
      onValueChange(value.filter(v => v !== val));
    } else {
      onValueChange([...value, val]);
    }
  };

  const removeValue = (val, e) => {
    e.stopPropagation();
    onValueChange(value.filter(v => v !== val));
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            'w-full justify-between min-h-[40px] h-auto font-normal dark:bg-slate-900 dark:border-slate-600',
            !selectedOptions.length && 'text-muted-foreground',
            className
          )}
        >
          <div className="flex flex-wrap gap-1 flex-1">
            {selectedOptions.length === 0 ? (
              <span className="text-slate-400 dark:text-slate-500">{placeholder}</span>
            ) : (
              selectedOptions.map(opt => (
                <Badge
                  key={opt.value}
                  variant="secondary"
                  className="gap-1 dark:bg-slate-700 dark:text-slate-200"
                >
                  {opt.label}
                  <X
                    className="w-3 h-3 cursor-pointer hover:text-rose-500"
                    onClick={(e) => removeValue(opt.value, e)}
                  />
                </Badge>
              ))
            )}
          </div>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="p-0 dark:bg-slate-800 dark:border-slate-700"
        align="start"
        style={{ width: 'var(--radix-popover-trigger-width)' }}
      >
        <Command>
          <CommandInput
            placeholder={searchPlaceholder}
            className="dark:text-slate-200"
          />
          <CommandList>
            <CommandEmpty className="dark:text-slate-400">{emptyMessage}</CommandEmpty>
            <CommandGroup>
              {options.map(opt => {
                const isSelected = value.includes(opt.value);
                return (
                  <CommandItem
                    key={opt.value}
                    value={opt.label}
                    onSelect={() => toggleValue(opt.value)}
                    className="dark:text-slate-200 dark:data-[selected=true]:bg-slate-700"
                  >
                    <Check
                      className={cn(
                        'mr-2 h-4 w-4',
                        isSelected ? 'opacity-100' : 'opacity-0'
                      )}
                    />
                    <span className="truncate flex-1">{opt.label}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
