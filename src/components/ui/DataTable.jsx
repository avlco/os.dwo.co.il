import React, { useState, useMemo } from 'react';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";

export function DataTable({ 
  columns, 
  data = [], 
  searchKey, 
  onRowClick,
  page = 1,
  totalPages = 1,
  onPageChange,
  isLoading,
  emptyMessage = "אין תוצאות."
}) {
  const [searchValue, setSearchValue] = useState('');

  const filteredData = useMemo(() => {
    if (!searchKey || !searchValue) return data;
    return data.filter(row => {
      const value = row[searchKey];
      return value && String(value).toLowerCase().includes(searchValue.toLowerCase());
    });
  }, [data, searchKey, searchValue]);

  return (
    <div>
      <div className="flex items-center py-4">
        {searchKey && (
          <Input
            placeholder="חיפוש..."
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            className="max-w-sm ml-2"
          />
        )}
      </div>
      <div className="rounded-md border dark:border-slate-700">
        <Table>
          <TableHeader>
            <TableRow className="dark:border-slate-700">
              {columns.map((col, idx) => (
                <TableHead key={col.accessorKey || col.id || idx} className="text-right">
                  {col.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  <div className="flex justify-center items-center gap-2">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    <span>טוען נתונים...</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : filteredData.length > 0 ? (
              filteredData.map((row, rowIdx) => (
                <TableRow
                  key={row.id || rowIdx}
                  onClick={() => onRowClick && onRowClick(row)}
                  className={onRowClick ? "cursor-pointer dark:hover:bg-slate-800" : ""}
                >
                  {columns.map((col, colIdx) => (
                    <TableCell key={col.accessorKey || col.id || colIdx}>
                      {col.cell 
                        ? col.cell({ row: { original: row, getValue: (key) => row[key] } })
                        : row[col.accessorKey]
                      }
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                  {emptyMessage}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      
      {onPageChange && (
        <div className="flex items-center justify-end space-x-2 py-4">
          <div className="flex-1 text-sm text-muted-foreground ml-2">
            {totalPages > 0 ? `עמוד ${page} מתוך ${totalPages}` : ''}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(page - 1)}
              disabled={page <= 1 || isLoading}
            >
              הקודם
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(page + 1)}
              disabled={page >= totalPages || isLoading}
            >
              הבא
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// Export default for backward compatibility
export default DataTable;