import React, { useState, useRef } from 'react';
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Braces } from 'lucide-react';

const FILENAME_TOKENS = [
  { key: '{Case_No}', label: 'מספר תיק', example: '123456' },
  { key: '{Client_Name}', label: 'שם לקוח', example: 'אינטל' },
  { key: '{Client_No}', label: 'מספר לקוח', example: '789' },
  { key: '{Case_Type}', label: 'סוג תיק', example: 'patent' },
  { key: '{Official_No}', label: 'מספר רשמי', example: '2024001' },
  { key: '{Mail_Subject}', label: 'נושא המייל', example: 'OA' },
  { key: '{Mail_Date}', label: 'תאריך המייל', example: '2025-01-15' },
  { key: '{Date}', label: 'תאריך היום', example: '2025-01-15' },
  { key: '{Year}', label: 'שנה', example: '2025' },
  { key: '{Month}', label: 'חודש', example: '01' },
  { key: '{Original_Filename}', label: 'שם קובץ מקורי', example: 'document.pdf' },
];

export default function FilenameTemplateInput({ value, onChange, placeholder, className }) {
  const inputRef = useRef(null);
  const [preview, setPreview] = useState('');

  const handleInsertToken = (token) => {
    const input = inputRef.current;
    const start = input?.selectionStart || value?.length || 0;
    const newValue = (value || '').slice(0, start) + token + (value || '').slice(start);
    onChange(newValue);
    
    // Update preview
    updatePreview(newValue);
  };

  const updatePreview = (template) => {
    let result = template || '';
    
    FILENAME_TOKENS.forEach(token => {
      const regex = new RegExp(token.key.replace(/[{}]/g, '\\$&'), 'g');
      result = result.replace(regex, token.example);
    });
    
    setPreview(result);
  };

  React.useEffect(() => {
    updatePreview(value);
  }, [value]);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <Input
            ref={inputRef}
            value={value || ''}
            onChange={(e) => {
              onChange(e.target.value);
              updatePreview(e.target.value);
            }}
            placeholder={placeholder || "לדוגמה: {Case_No}_{Date}"}
            className={`font-mono ${className}`}
            dir="ltr"
          />
        </div>
        
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2">
              <Braces className="w-4 h-4" />
              טוקנים
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64 dark:bg-slate-800">
            <div className="p-2">
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">הוסף טוקן לתבנית:</p>
              {FILENAME_TOKENS.map(token => (
                <DropdownMenuItem 
                  key={token.key} 
                  onClick={() => handleInsertToken(token.key)}
                  className="dark:text-slate-200 dark:hover:bg-slate-700 cursor-pointer"
                >
                  <div className="flex items-center gap-2 w-full">
                    <code className="text-xs bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded flex-shrink-0">
                      {token.key}
                    </code>
                    <span className="text-xs flex-1">{token.label}</span>
                  </div>
                </DropdownMenuItem>
              ))}
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Preview */}
      {preview && preview !== value && (
        <div className="p-2 bg-slate-100 dark:bg-slate-900 rounded border dark:border-slate-700">
          <Label className="text-xs text-slate-500 mb-1 block">תצוגה מקדימה:</Label>
          <code className="text-xs text-blue-600 dark:text-blue-400 dir-ltr block">
            {preview}
          </code>
        </div>
      )}

      {/* Token Reference */}
      <div className="flex flex-wrap gap-1">
        {FILENAME_TOKENS.slice(0, 6).map(token => (
          <button
            key={token.key}
            onClick={() => handleInsertToken(token.key)}
            className="text-[10px] px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
          >
            {token.key}
          </button>
        ))}
      </div>
    </div>
  );
}