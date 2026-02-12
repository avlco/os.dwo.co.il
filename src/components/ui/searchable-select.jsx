import React, { useState, useMemo } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
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

export default function SearchableSelect({
  value,
  onValueChange,
  options = [],
  placeholder = 'Select...',
  searchPlaceholder = 'Search...',
  emptyMessage = 'No results found',
  disabled = false,
  className,
}) {
  const [open, setOpen] = useState(false);

  const selectedOption = useMemo(
    () => options.find(opt => opt.value === value),
    [options, value]
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            'w-full justify-between h-9 font-normal dark:bg-slate-900 dark:border-slate-600',
            !selectedOption && 'text-muted-foreground',
            className
          )}
        >
          <span className="truncate">
            {selectedOption ? selectedOption.label : placeholder}
          </span>
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
              {options.map(opt => (
                <CommandItem
                  key={opt.value}
                  value={opt.label}
                  onSelect={() => {
                    onValueChange(opt.value === value ? '' : opt.value);
                    setOpen(false);
                  }}
                  className="dark:text-slate-200 dark:data-[selected=true]:bg-slate-700"
                >
                  <Check
                    className={cn(
                      'mr-2 h-4 w-4',
                      value === opt.value ? 'opacity-100' : 'opacity-0'
                    )}
                  />
                  <span className="truncate flex-1">{opt.label}</span>
                  {opt.sublabel && (
                    <span className="ml-auto text-xs text-muted-foreground">{opt.sublabel}</span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
