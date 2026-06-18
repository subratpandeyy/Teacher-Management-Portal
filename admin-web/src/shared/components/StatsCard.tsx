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
    <div className="stat-card group">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="stat-card-label">{title}</p>
          <h3 className="stat-card-value">{value}</h3>
        </div>
        <div className="stat-card-icon bg-green-50 text-blue-600 transition-colors duration-200 group-hover:bg-green-100">
          {icon}
        </div>
      </div>
      {(description || trend) && (
        <div className="mt-3 flex items-center gap-2">
          {trend && (
            <span
              className={`inline-flex items-center gap-1 text-xs font-semibold ${
                trend.isUp ? 'text-emerald-600' : 'text-rose-600'
              }`}
              aria-label={`${trend.isUp ? 'Up' : 'Down'} by ${trend.value} percent`}
            >
              <span aria-hidden="true">{trend.isUp ? '↑' : '↓'}</span>
              {trend.value}%
            </span>
          )}
          {description && <p className="text-xs text-slate-400">{description}</p>}
        </div>
      )}
    </div>
  );
}
