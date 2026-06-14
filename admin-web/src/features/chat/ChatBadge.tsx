import type { UserRole } from '../../../../shared/types';

interface ChatBadgeProps {
  role: UserRole;
}

export function ChatBadge({ role }: ChatBadgeProps) {
  const styles = {
    admin: 'bg-rose-100 text-rose-700 border-rose-200',
    coordinator: 'bg-amber-100 text-amber-700 border-amber-200',
    teacher: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    student: 'bg-blue-100 text-blue-700 border-blue-200',
  };

  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${styles[role]}`}>
      {role}
    </span>
  );
}
