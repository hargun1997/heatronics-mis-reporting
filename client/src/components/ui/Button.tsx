/* eslint-disable react-refresh/only-export-components */
// Button (GUIDE.md "Buttons"): the ONE button for the MIS. Height 40, touch area 44 on phones, corner 10, verb first.
//   primary   = the one orange action on a screen (#C2410C, white text)
//   secondary = white, every other action (default)
//   danger    = red fill, only inside a confirm modal
//   danger-outline = opens a red confirm modal
//   text      = Show all, Undo, links inside cards
// While `busy`, it shows a spinner and `busyLabel` ("Saving") at the same size; a second click does nothing.
// BTN / BTN_PRIMARY (states.tsx) are the same looks as class strings for <a> and <Link>.
import React from 'react';
import { Loader2 } from 'lucide-react';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'danger-outline' | 'text';
export type ButtonSize = 'md' | 'sm' | 'lg';

const BASE = 'inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-2 disabled:cursor-default disabled:opacity-50';
const SIZE: Record<ButtonSize, string> = {
  sm: 'min-h-11 sm:min-h-8 px-2.5 text-label',
  md: 'min-h-11 sm:min-h-10 px-3.5 text-sm',
  lg: 'min-h-14 px-5 text-base',
};
const VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-cta font-semibold text-on-cta hover:bg-cta-hover',
  secondary: 'border border-slate-200 bg-white text-slate-800 hover:bg-slate-50',
  danger: 'bg-red-700 font-semibold text-white hover:bg-red-800',
  'danger-outline': 'border border-red-300 bg-white text-red-700 hover:bg-red-50',
  text: 'px-1.5 text-accent-600 hover:bg-slate-100 hover:text-accent-700',
};

/** Class string for a link that looks like a button. */
export function buttonClass(variant: ButtonVariant = 'secondary', size: ButtonSize = 'md', extra = ''): string {
  return `${BASE} ${SIZE[size]} ${VARIANT[variant]} ${extra}`.trim();
}

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  busy?: boolean;
  /** The word shown while busy ("Saving", "Pulling"). */
  busyLabel?: string;
  icon?: React.ReactNode;
  'data-autofocus'?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', busy, busyLabel, icon, className = '', children, disabled, type = 'button', onClick, ...rest }, ref,
) {
  return (
    <button ref={ref} type={type} {...rest} disabled={disabled} aria-busy={busy || undefined}
      onClick={busy ? undefined : onClick}
      className={buttonClass(variant, size, className)}>
      {busy ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden /> : icon}
      {busy && busyLabel ? busyLabel : children}
    </button>
  );
});
