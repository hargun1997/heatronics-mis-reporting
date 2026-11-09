import { Children, cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from 'react';

const CONTROLS = new Set(['select', 'input', 'textarea']);

/**
 * A caption above a control. When the only child is a native select / input / textarea the caption becomes
 * its <label> (screen readers announce it; tapping the caption focuses the control). Anything else
 * (segmented buttons, several controls) gets a named group instead, so a label never wraps buttons.
 */
export function LabeledField({ label, children, className = 'text-xs text-slate-500', captionClassName = 'block mb-1' }: {
  label: ReactNode; children: ReactNode; className?: string; captionClassName?: string;
}) {
  const id = useId();
  const only = Children.count(children) === 1 ? Children.only(children) : null;
  const control = isValidElement(only) && typeof only.type === 'string' && CONTROLS.has(only.type)
    ? (only as ReactElement<{ id?: string }>) : null;
  if (control) {
    const cid = control.props.id || `${id}-c`;
    return (
      <div className={className}>
        <label htmlFor={cid} className={captionClassName}>{label}</label>
        {cloneElement(control, { id: cid })}
      </div>
    );
  }
  return (
    <div className={className} role="group" aria-labelledby={`${id}-l`}>
      <span id={`${id}-l`} className={captionClassName}>{label}</span>
      {children}
    </div>
  );
}
