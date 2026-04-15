import React from 'react';
import { Link } from 'react-router-dom';

interface CardProps {
  children: React.ReactNode;
  className?: string;
}

export function Card({ children, className = '' }: CardProps) {
  return (
    <div className={`bg-white rounded-xl border border-slate-200 shadow-soft ${className}`}>
      {children}
    </div>
  );
}

interface SectionCardProps {
  title?: string;
  description?: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

export function SectionCard({ title, description, children, actions, className = '' }: SectionCardProps) {
  return (
    <Card className={className}>
      {(title || actions) && (
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-100">
          <div>
            {title && <h3 className="text-sm font-semibold text-slate-900">{title}</h3>}
            {description && <p className="text-xs text-slate-500 mt-0.5">{description}</p>}
          </div>
          {actions}
        </div>
      )}
      <div className="p-5">{children}</div>
    </Card>
  );
}

interface NavCardProps {
  to: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  accent?: 'brand' | 'emerald' | 'violet' | 'amber' | 'sky' | 'rose';
  badge?: string;
}

const accentMap: Record<NonNullable<NavCardProps['accent']>, { bg: string; icon: string; ring: string; text: string }> = {
  brand:   { bg: 'bg-brand-50',   icon: 'bg-brand-100 text-brand-700',     ring: 'ring-brand-200',   text: 'text-brand-700' },
  emerald: { bg: 'bg-emerald-50', icon: 'bg-emerald-100 text-emerald-700', ring: 'ring-emerald-200', text: 'text-emerald-700' },
  violet:  { bg: 'bg-violet-50',  icon: 'bg-violet-100 text-violet-700',   ring: 'ring-violet-200',  text: 'text-violet-700' },
  amber:   { bg: 'bg-amber-50',   icon: 'bg-amber-100 text-amber-700',     ring: 'ring-amber-200',   text: 'text-amber-700' },
  sky:     { bg: 'bg-sky-50',     icon: 'bg-sky-100 text-sky-700',         ring: 'ring-sky-200',     text: 'text-sky-700' },
  rose:    { bg: 'bg-rose-50',    icon: 'bg-rose-100 text-rose-700',       ring: 'ring-rose-200',    text: 'text-rose-700' },
};

export function NavCard({ to, title, description, icon, accent = 'brand', badge }: NavCardProps) {
  const c = accentMap[accent];
  return (
    <Link
      to={to}
      className={`group relative block rounded-xl border border-slate-200 bg-white p-5 card-lift hover:ring-1 ${c.ring}`}
    >
      <div className="flex items-start gap-4">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${c.icon} flex-shrink-0`}>
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
            {badge && (
              <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded ${c.bg} ${c.text}`}>
                {badge}
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-slate-500 leading-relaxed">{description}</p>
        </div>
        <svg className="h-4 w-4 text-slate-300 group-hover:text-slate-500 mt-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </Link>
  );
}

interface PillProps {
  children: React.ReactNode;
  color?: 'slate' | 'brand' | 'emerald' | 'amber' | 'rose' | 'sky' | 'violet';
  size?: 'xs' | 'sm';
}

const pillColorMap: Record<NonNullable<PillProps['color']>, string> = {
  slate:   'bg-slate-100 text-slate-700 border-slate-200',
  brand:   'bg-brand-50 text-brand-700 border-brand-100',
  emerald: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  amber:   'bg-amber-50 text-amber-700 border-amber-100',
  rose:    'bg-rose-50 text-rose-700 border-rose-100',
  sky:     'bg-sky-50 text-sky-700 border-sky-100',
  violet:  'bg-violet-50 text-violet-700 border-violet-100',
};

export function Pill({ children, color = 'slate', size = 'sm' }: PillProps) {
  const sizeCls = size === 'xs' ? 'text-[10px] px-1.5 py-0.5' : 'text-xs px-2 py-0.5';
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border font-medium ${pillColorMap[color]} ${sizeCls}`}>
      {children}
    </span>
  );
}
