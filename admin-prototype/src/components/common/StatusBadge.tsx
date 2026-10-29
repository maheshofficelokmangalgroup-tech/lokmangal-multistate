import React from 'react';
import { 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  FileText, 
  Archive, 
  Sparkles,
  Send,
  UserCheck
} from 'lucide-react';

export type BadgeStatus = 
  | 'live' 
  | 'approved' 
  | 'active'
  | 'converted' 
  | 'selected'
  | 'pending' 
  | 'pending_approval' 
  | 'scheduled' 
  | 'in_progress' 
  | 'contacted'
  | 'shortlisted'
  | 'interview'
  | 'new'
  | 'draft' 
  | 'archived' 
  | 'superseded' 
  | 'closed'
  | 'rejected' 
  | 'failed' 
  | 'spam'
  | 'not_interested';

interface StatusBadgeProps {
  status: BadgeStatus | string;
  size?: 'sm' | 'md';
  className?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, size = 'sm', className = '' }) => {
  const norm = status.toLowerCase();

  let styles = 'bg-zinc-100 text-zinc-700 border-zinc-200';
  let Icon = FileText;
  let label = status.replace(/_/g, ' ');

  // Success Green
  if (['live', 'approved', 'active', 'converted', 'selected'].includes(norm)) {
    styles = 'bg-emerald-50 text-emerald-800 border-emerald-200';
    Icon = CheckCircle2;
  } 
  // Warning Amber / Orange
  else if (['pending', 'pending_approval', 'scheduled', 'in_progress', 'contacted', 'shortlisted', 'interview'].includes(norm)) {
    styles = 'bg-amber-50 text-amber-800 border-amber-200';
    Icon = Clock;
  } 
  // Blue / Info
  else if (['new'].includes(norm)) {
    styles = 'bg-blue-50 text-blue-700 border-blue-200';
    Icon = Sparkles;
  }
  // Destructive Red
  else if (['rejected', 'failed', 'spam', 'not_interested'].includes(norm)) {
    styles = 'bg-rose-50 text-rose-800 border-rose-200';
    Icon = AlertCircle;
  }
  // Neutral Gray
  else if (['draft', 'archived', 'superseded', 'closed'].includes(norm)) {
    styles = 'bg-zinc-100 text-zinc-700 border-zinc-200';
    Icon = norm === 'archived' ? Archive : FileText;
  }

  const padding = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs font-medium';

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border capitalize font-medium ${padding} ${styles} ${className}`}
    >
      <Icon className="w-3.5 h-3.5 flex-shrink-0" />
      <span>{label}</span>
    </span>
  );
};
