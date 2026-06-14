import type { ReactNode } from 'react';

interface StatsCardProps {
  title: string;
  value: string | number;
  icon: ReactNode;
  description?: string;
  trend?: {
    value: number;
    isUp: boolean;
  };
}

export function StatsCard({ title, value, icon, description, trend }: StatsCardProps) {
  return (
    <div className="rounded-xl border border-slate-100 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500">{title}</p>
          <h3 className="mt-1 text-2xl font-bold text-slate-900">{value}</h3>
        </div>
        <div className="rounded-lg bg-slate-50 p-3 text-slate-600">
          {icon}
        </div>
      </div>
      {(description || trend) && (
        <div className="mt-4 flex items-center gap-2">
          {trend && (
            <span className={`text-xs font-medium ${trend.isUp ? 'text-emerald-600' : 'text-rose-600'}`}>
              {trend.isUp ? '↑' : '↓'} {trend.value}%
            </span>
          )}
          {description && <p className="text-xs text-slate-400">{description}</p>}
        </div>
      )}
    </div>
  );
}
