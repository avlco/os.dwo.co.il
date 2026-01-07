import React from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";

export default function DataTable({ columns, data, isLoading, onRowClick, emptyMessage = "אין נתונים להצגה" }) {
  if (isLoading) {
    return (
      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50/80">
              {columns.map((col, idx) => (
                <TableHead key={idx} className="text-right font-semibold text-slate-600">
                  <Skeleton className="h-4 w-20" />
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {[...Array(5)].map((_, idx) => (
              <TableRow key={idx}>
                {columns.map((_, cidx) => (
                  <TableCell key={cidx}>
                    <Skeleton className="h-4 w-full" />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-100 p-12 text-center">
        <p className="text-slate-400">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-slate-50/80 border-b border-slate-100">
            {columns.map((col, idx) => (
              <TableHead 
                key={idx} 
                className="text-right font-semibold text-slate-600 py-4"
              >
                {col.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((row, idx) => (
            <TableRow 
              key={row.id || idx} 
              className={`border-b border-slate-50 hover:bg-slate-50/50 transition-colors ${onRowClick ? 'cursor-pointer' : ''}`}
              onClick={() => onRowClick && onRowClick(row)}
            >
              {columns.map((col, cidx) => (
                <TableCell key={cidx} className="py-4">
                  {col.render ? col.render(row) : row[col.accessor]}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}