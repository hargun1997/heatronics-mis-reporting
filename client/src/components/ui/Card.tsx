import React from 'react';
import { InfoTip } from './states';
import { StatusPill } from './StatusPill';
import type { PillTone } from './pill';

interface CardProps {
  children: React.ReactNode;
  className?: string;
}

export function Card({ children, className = '' }: CardProps) {
  return (
    <div className={`min-w-0 bg-surface rounded-xl border border-slate-200 ${className}`}>
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

/** Same look as `Panel` (states.tsx): one title row, then the content. A description is a note behind an "i",
 *  never a paragraph under the title (simplification, 11 Nov 2026). */
export function SectionCard({ title, description, children, actions, className = '' }: SectionCardProps) {
  return (
    <Card className={className}>
      {(title || actions) && (
        <div className="flex min-h-12 flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-1.5">
          <div className="flex min-w-0 items-center gap-0.5">
            {title && <h3 className="text-sm font-semibold text-slate-900">{title}</h3>}
            {description && <InfoTip label={title ? `About ${title}` : 'About this section'}>{description}</InfoTip>}
          </div>
          {actions}
        </div>
      )}
      <div className="p-4">{children}</div>
    </Card>
  );
}

interface PillProps {
  children: React.ReactNode;
  color?: 'slate' | 'brand' | 'emerald' | 'amber' | 'rose' | 'sky' | 'violet';
  size?: 'xs' | 'sm';
}

// Old colour names point at the guide's meanings (GUIDE.md "Status and pills"): sky / violet were decoration, so grey.
const TONE: Record<NonNullable<PillProps['color']>, PillTone> = {
  slate: 'neutral', sky: 'neutral', violet: 'neutral', brand: 'brand', emerald: 'positive', amber: 'warning', rose: 'critical',
};

/** Kept for old callers; the pill itself is StatusPill. */
export function Pill({ children, color = 'slate', size = 'sm' }: PillProps) {
  return <StatusPill toneName={TONE[color]} size={size === 'xs' ? 'sm' : 'md'}>{children}</StatusPill>;
}
