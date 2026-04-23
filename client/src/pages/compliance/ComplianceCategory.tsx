import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, Navigate } from 'react-router-dom';
import { PageHeader } from '../../components/ui/PageHeader';
import { Pill } from '../../components/ui/Card';
import type {
  ComplianceCategory as ComplianceCategoryData,
  ComplianceCategoryKey,
  ComplianceFrequency,
  ComplianceItem,
} from '../../data/compliance/types';
import {
  ALL_CATEGORIES,
  CATEGORY_META,
} from '../../data/compliance/types';
import {
  clearOverride,
  clearProgress,
  dayKey,
  formatDueDate,
  frequencyLabel,
  getAllProgress,
  hasOverride,
  isDueInMonth,
  isDueInWeek,
  isDueOnDate,
  loadCategory,
  monthKey,
  saveOverride,
  setProgress,
  weekBucket,
  weekKey,
  yearMonth,
} from '../../data/compliance/storage';
import { CategoryTabs } from './CategoryTabs';
import { MonthStrip } from './MonthStrip';
import { DateStrip } from './DateStrip';
import { WeekStrip } from './WeekStrip';
import { ViewModeTabs } from './ViewModeTabs';
import type { ViewMode } from './ViewModeTabs';

const iconCal = (
  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
  </svg>
);

const FREQ_OPTIONS: ComplianceFrequency[] = [
  'daily',
  'weekly',
  'monthly',
  'quarterly',
  'half-yearly',
  'yearly',
  'one-time',
];

export function ComplianceCategory() {
  const { category } = useParams<{ category: string }>();

  if (!category || !(ALL_CATEGORIES as string[]).includes(category)) {
    return <Navigate to="/calendar" replace />;
  }

  return <CategoryView categoryKey={category as ComplianceCategoryKey} />;
}

function CategoryView({ categoryKey }: { categoryKey: ComplianceCategoryKey }) {
  const meta = CATEGORY_META[categoryKey];
  const [data, setData] = useState<ComplianceCategoryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [overridden, setOverridden] = useState(false);

  const now = useMemo(() => new Date(), []);
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [viewMode, setViewMode] = useState<ViewMode>('monthly');
  const [selectedDay, setSelectedDay] = useState(now.getDate());
  const [selectedWeek, setSelectedWeek] = useState(weekBucket(now.getDate()));

  const [progressTick, setProgressTick] = useState(0);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ComplianceItem | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const d = await loadCategory(categoryKey);
      setData(d);
      setOverridden(hasOverride(categoryKey));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [categoryKey]);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    const onFocus = () => { reload(); };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [reload]);

  const periodKey = useMemo(() => {
    if (viewMode === 'daily') return dayKey(year, month, selectedDay);
    if (viewMode === 'weekly') return weekKey(year, month, selectedWeek);
    return monthKey(year, month);
  }, [viewMode, year, month, selectedDay, selectedWeek]);

  const dueItems = useMemo(() => {
    if (!data) return [];
    if (viewMode === 'daily')
      return data.items.filter((i) => isDueOnDate(i, year, month, selectedDay));
    if (viewMode === 'weekly')
      return data.items.filter((i) => isDueInWeek(i, year, month, selectedWeek));
    return data.items.filter((i) => isDueInMonth(i, year, month));
  }, [data, year, month, viewMode, selectedDay, selectedWeek]);

  const nonDueItems = useMemo(() => {
    if (!data) return [];
    return data.items.filter((i) => !isDueInMonth(i, year, month));
  }, [data, year, month]);

  const progress = getAllProgress();
  const doneCount = dueItems.filter((i) => progress[i.id]?.[periodKey]?.completed).length;
  const pct = dueItems.length === 0 ? 0 : Math.round((doneCount / dueItems.length) * 100);

  // --- handlers ---
  const persist = (items: ComplianceItem[]) => {
    if (!data) return;
    const next = { ...data, items };
    setData(next);
    saveOverride(categoryKey, items);
    setOverridden(true);
  };

  const handleToggle = (item: ComplianceItem) => {
    const existing = progress[item.id]?.[periodKey];
    if (existing?.completed) {
      clearProgress(item.id, periodKey);
    } else {
      setProgress(item.id, periodKey, {
        completed: true,
        completedAt: new Date().toISOString(),
      });
    }
    setProgressTick((t) => t + 1);
  };

  const handleSaveItem = (item: ComplianceItem) => {
    if (!data) return;
    const existingIdx = data.items.findIndex((i) => i.id === item.id);
    const items =
      existingIdx >= 0
        ? data.items.map((i, idx) => (idx === existingIdx ? item : i))
        : [...data.items, item];
    persist(items);
    setEditorOpen(false);
    setEditingItem(null);
  };

  const handleDelete = (id: string) => {
    if (!data) return;
    if (!confirm('Delete this compliance item? Progress history for it will remain in storage.'))
      return;
    persist(data.items.filter((i) => i.id !== id));
  };

  const handleResetToTemplate = async () => {
    if (!confirm('Discard all local edits and reload the template JSON? Progress is kept.'))
      return;
    clearOverride(categoryKey);
    await reload();
  };

  const handleExport = () => {
    if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `compliance-${categoryKey}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as ComplianceCategoryData;
        if (!parsed.items || !Array.isArray(parsed.items)) throw new Error('Invalid JSON');
        persist(parsed.items);
      } catch {
        alert('That file does not look like a compliance JSON export.');
      }
    };
    reader.readAsText(file);
  };

  if (loading) {
    return (
      <>
        <PageHeader title={meta.name} accent={meta.accent} icon={iconCal} />
        <CategoryTabs />
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12 text-center text-sm text-slate-500">
          Loading compliance items&hellip;
        </div>
      </>
    );
  }

  if (error || !data) {
    return (
      <>
        <PageHeader title={meta.name} accent={meta.accent} icon={iconCal} />
        <CategoryTabs />
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            {error || 'Unable to load compliance data.'}
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={meta.name}
        description={data.description}
        accent={meta.accent}
        icon={iconCal}
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setEditingItem(null);
                setEditorOpen(true);
              }}
              className="px-3 py-1.5 bg-brand-500 hover:bg-brand-600 text-white text-xs font-medium rounded-lg transition-colors"
            >
              + Add item
            </button>
            <button
              onClick={handleExport}
              className="px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-medium rounded-lg transition-colors"
            >
              Export
            </button>
            <label className="px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-medium rounded-lg transition-colors cursor-pointer">
              Import
              <input type="file" accept=".json" onChange={handleImport} className="hidden" />
            </label>
          </div>
        }
      />

      <CategoryTabs />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <ViewModeTabs mode={viewMode} onChange={setViewMode} />
          <div className="text-sm text-slate-700">
            <span className="font-semibold text-slate-900">{doneCount}</span>
            <span className="text-slate-500"> / {dueItems.length} done</span>
          </div>
        </div>

        <MonthStrip
          year={year}
          month={month}
          items={data.items}
          onChange={(y, m) => { setYear(y); setMonth(m); }}
        />

        {viewMode === 'daily' && (
          <DateStrip
            year={year}
            month={month}
            selectedDay={selectedDay}
            items={data.items.filter((i) => isDueInMonth(i, year, month))}
            onChange={setSelectedDay}
          />
        )}

        {viewMode === 'weekly' && (
          <WeekStrip
            year={year}
            month={month}
            selectedWeek={selectedWeek}
            items={data.items.filter((i) => isDueInMonth(i, year, month))}
            onChange={setSelectedWeek}
          />
        )}

        <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
          <div className="h-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
        </div>

        {/* Overridden banner */}
        {overridden && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-800 flex items-center justify-between gap-3">
            <span>Local edits are active. Template JSON in the repo is unchanged.</span>
            <button
              onClick={handleResetToTemplate}
              className="px-2.5 py-1 bg-white border border-amber-200 hover:bg-amber-100 text-amber-800 text-[11px] font-medium rounded-md"
            >
              Reset to template
            </button>
          </div>
        )}

        {/* Due items */}
        <ItemsTable
          key={`due-${progressTick}`}
          title={`Due ${viewMode === 'daily' ? 'today' : viewMode === 'weekly' ? 'this week' : 'this month'} (${dueItems.length})`}
          items={dueItems}
          year={year}
          month={month}
          periodKey={periodKey}
          progress={progress}
          onToggle={handleToggle}
          onEdit={(i) => { setEditingItem(i); setEditorOpen(true); }}
          onDelete={handleDelete}
          emptyLabel={`Nothing due ${viewMode === 'daily' ? 'on this date' : viewMode === 'weekly' ? 'this week' : 'this month'}.`}
        />

        {/* Not due — collapsed by default */}
        {nonDueItems.length > 0 && (
          <CollapsibleSection title={`Not due this month (${nonDueItems.length})`}>
            <ItemsTable
              title=""
              items={nonDueItems}
              year={year}
              month={month}
              periodKey={monthKey(year, month)}
              progress={progress}
              onToggle={handleToggle}
              onEdit={(i) => { setEditingItem(i); setEditorOpen(true); }}
              onDelete={handleDelete}
              muted
              headless
            />
          </CollapsibleSection>
        )}
      </div>

      {editorOpen && (
        <ItemEditor
          initial={editingItem}
          onClose={() => { setEditorOpen(false); setEditingItem(null); }}
          onSave={handleSaveItem}
          existingIds={data.items.map((i) => i.id)}
        />
      )}
    </>
  );
}

// ---------------- CollapsibleSection ----------------

function CollapsibleSection({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-5 py-3 text-left"
      >
        <span className="text-sm font-medium text-slate-700">{title}</span>
        <svg
          className={`h-4 w-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && <div className="border-t border-slate-100">{children}</div>}
    </div>
  );
}

// ---------------- ItemsTable ----------------

function ItemsTable({
  title,
  items,
  year,
  month,
  periodKey: pk,
  progress,
  onToggle,
  onEdit,
  onDelete,
  emptyLabel,
  muted,
  headless,
}: {
  title: string;
  items: ComplianceItem[];
  year: number;
  month: number;
  periodKey: string;
  progress: ReturnType<typeof getAllProgress>;
  onToggle: (item: ComplianceItem) => void;
  onEdit: (item: ComplianceItem) => void;
  onDelete: (id: string) => void;
  emptyLabel?: string;
  muted?: boolean;
  headless?: boolean;
}) {
  return (
    <div className={`${headless ? '' : 'rounded-xl border border-slate-200'} bg-white ${muted ? 'opacity-90' : ''}`}>
      {!headless && (
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
          <span className="text-[11px] uppercase tracking-wider text-slate-400">{items.length} items</span>
        </div>
      )}
      {items.length === 0 ? (
        <div className="px-5 py-6 text-center text-xs text-slate-500">{emptyLabel || '—'}</div>
      ) : (
        <div className="divide-y divide-slate-100">
          {items.map((item) => {
            const done = !!progress[item.id]?.[pk]?.completed;
            const dueText = formatDueDate(item, year, month);
            return (
              <div key={item.id} className="px-5 py-3 flex items-start gap-3 group">
                <button
                  onClick={() => onToggle(item)}
                  className={`mt-0.5 flex-shrink-0 w-5 h-5 rounded-md border transition-all flex items-center justify-center ${
                    done
                      ? 'bg-emerald-500 border-emerald-500 text-white'
                      : 'bg-white border-slate-300 hover:border-emerald-400'
                  }`}
                  aria-label={done ? 'Mark incomplete' : 'Mark complete'}
                >
                  {done && (
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center flex-wrap gap-2">
                    <span className={`text-sm font-medium ${done ? 'text-slate-500 line-through' : 'text-slate-900'}`}>
                      {item.title}
                    </span>
                    {item.form && <Pill color="sky" size="xs">{item.form}</Pill>}
                    <Pill color="slate" size="xs">{frequencyLabel(item.frequency)}</Pill>
                    {item.authority && <Pill color="violet" size="xs">{item.authority}</Pill>}
                  </div>
                  {item.description && (
                    <p className="mt-1 text-xs text-slate-600 leading-relaxed">{item.description}</p>
                  )}
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500">
                    <span>
                      <span className="text-slate-400">Due:</span>{' '}
                      <span className="font-medium text-slate-700">{dueText}</span>
                    </span>
                    {item.owner && (
                      <span>
                        <span className="text-slate-400">Owner:</span>{' '}
                        <span className="font-medium text-slate-700">{item.owner}</span>
                      </span>
                    )}
                    {item.penalty && (
                      <span className="text-rose-600">
                        <span className="text-rose-400">Penalty:</span> {item.penalty}
                      </span>
                    )}
                  </div>
                  {item.notes && (
                    <p className="mt-1 text-[11px] text-slate-500 italic">{item.notes}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => onEdit(item)}
                    className="px-2 py-1 text-[11px] rounded border border-slate-200 bg-white hover:bg-slate-50 text-slate-600"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => onDelete(item.id)}
                    className="px-2 py-1 text-[11px] rounded border border-slate-200 bg-white hover:bg-rose-50 hover:border-rose-200 hover:text-rose-700 text-slate-600"
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------- ItemEditor ----------------

function ItemEditor({
  initial,
  onClose,
  onSave,
  existingIds,
}: {
  initial: ComplianceItem | null;
  onClose: () => void;
  onSave: (item: ComplianceItem) => void;
  existingIds: string[];
}) {
  const isEdit = !!initial;
  const [item, setItem] = useState<ComplianceItem>(
    initial ?? {
      id: '',
      title: '',
      frequency: 'monthly',
      dueDay: 1,
    }
  );
  const [idError, setIdError] = useState<string | null>(null);

  const update = <K extends keyof ComplianceItem>(key: K, value: ComplianceItem[K]) => {
    setItem((cur) => ({ ...cur, [key]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!item.title.trim()) return;
    const id = (item.id || slug(item.title)).trim();
    if (!isEdit && existingIds.includes(id)) {
      setIdError(`An item with id "${id}" already exists. Edit its title or set a custom id.`);
      return;
    }
    onSave({
      ...item,
      id,
      title: item.title.trim(),
      description: item.description?.trim() || undefined,
      owner: item.owner?.trim() || undefined,
      authority: item.authority?.trim() || undefined,
      form: item.form?.trim() || undefined,
      penalty: item.penalty?.trim() || undefined,
      notes: item.notes?.trim() || undefined,
    });
  };

  const showDueDay = ['monthly', 'quarterly', 'half-yearly', 'yearly'].includes(item.frequency);
  const showDueMonth = item.frequency === 'yearly';
  const showMonths = item.frequency === 'quarterly' || item.frequency === 'half-yearly';

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center px-4 py-6 overflow-y-auto">
      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-xl shadow-card max-w-lg w-full max-h-full overflow-y-auto"
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-slate-900">
            {isEdit ? 'Edit compliance item' : 'Add compliance item'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 text-xl leading-none"
            aria-label="Close"
          >
            &times;
          </button>
        </div>
        <div className="p-5 space-y-3">
          <Field label="Title" required>
            <input
              value={item.title}
              onChange={(e) => update('title', e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
              placeholder="e.g. File GSTR-1"
              autoFocus
            />
          </Field>

          <Field label="Description">
            <textarea
              value={item.description ?? ''}
              onChange={(e) => update('description', e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Frequency">
              <select
                value={item.frequency}
                onChange={(e) => update('frequency', e.target.value as ComplianceFrequency)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
              >
                {FREQ_OPTIONS.map((f) => (
                  <option key={f} value={f}>{frequencyLabel(f)}</option>
                ))}
              </select>
            </Field>
            {showDueDay && (
              <Field label="Due day of month">
                <input
                  type="number"
                  min={1}
                  max={31}
                  value={item.dueDay ?? ''}
                  onChange={(e) => update('dueDay', e.target.value === '' ? undefined : Number(e.target.value))}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                />
              </Field>
            )}
          </div>

          {showDueMonth && (
            <Field label="Due month (1-12)">
              <input
                type="number"
                min={1}
                max={12}
                value={item.dueMonth ?? ''}
                onChange={(e) => update('dueMonth', e.target.value === '' ? undefined : Number(e.target.value))}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
              />
            </Field>
          )}

          {showMonths && (
            <Field label="Due months (comma-separated, 1-12)">
              <input
                value={(item.months ?? []).join(', ')}
                onChange={(e) =>
                  update(
                    'months',
                    e.target.value
                      .split(',')
                      .map((v) => parseInt(v.trim(), 10))
                      .filter((n) => !isNaN(n) && n >= 1 && n <= 12)
                  )
                }
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                placeholder="e.g. 4, 7, 10, 1"
              />
            </Field>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Owner">
              <input
                value={item.owner ?? ''}
                onChange={(e) => update('owner', e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                placeholder="e.g. Accounts Manager"
              />
            </Field>
            <Field label="Authority">
              <input
                value={item.authority ?? ''}
                onChange={(e) => update('authority', e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                placeholder="e.g. GSTN"
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Form / Return">
              <input
                value={item.form ?? ''}
                onChange={(e) => update('form', e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                placeholder="e.g. GSTR-1"
              />
            </Field>
            <Field label="Penalty">
              <input
                value={item.penalty ?? ''}
                onChange={(e) => update('penalty', e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
              />
            </Field>
          </div>

          <Field label="Notes">
            <textarea
              value={item.notes ?? ''}
              onChange={(e) => update('notes', e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
            />
          </Field>

          {!isEdit && (
            <Field label="Custom ID (optional)">
              <input
                value={item.id}
                onChange={(e) => { update('id', e.target.value); setIdError(null); }}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                placeholder="auto-generated from title"
              />
              {idError && <p className="mt-1 text-[11px] text-rose-600">{idError}</p>}
            </Field>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-slate-100 bg-slate-50">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-medium rounded-lg"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-3 py-1.5 bg-brand-500 hover:bg-brand-600 text-white text-xs font-medium rounded-lg"
          >
            {isEdit ? 'Save changes' : 'Add item'}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1">
        {label} {required && <span className="text-rose-500">*</span>}
      </label>
      {children}
    </div>
  );
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 48);
}
