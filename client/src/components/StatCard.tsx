import type { LucideIcon } from 'lucide-react';

interface StatCardProps {
  icon: LucideIcon;
  value: number;
  label: string;
  accent?: 'default' | 'critical';
}

export function StatCard({ icon: Icon, value, label, accent = 'default' }: StatCardProps) {
  return (
    <div className={`stat-card${accent === 'critical' ? ' critical' : ''}`}>
      <Icon size={22} />
      <div className="stat-card-value">{value.toLocaleString()}</div>
      <div className="stat-card-label">{label}</div>
    </div>
  );
}
