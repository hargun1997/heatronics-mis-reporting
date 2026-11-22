// How the MIS reads one source: each file, what the MIS takes from it, what it leaves out and the P&L line each
// figure goes to. It lived on the Data rulebook's Sources tab, a second list of the same sources as Setup; since
// 22 Nov 2026 it sits in the source's Setup drawer, so each source is in 1 list (content: data/ingest/rulebook.ts).
import { CONNECTOR_RULES } from '../../data/ingest/rulebook';
import { Disclosure } from '../ui/Disclosure';
import { StatusPill } from '../ui/StatusPill';

export function SourceRules({ connectorId }: { connectorId: string }) {
  const c = CONNECTOR_RULES.find((x) => x.connectorId === connectorId);
  if (!c || !c.files.length) return null;
  return (
    <Disclosure title="How the MIS reads it" subtitle={`${c.files.length} report${c.files.length === 1 ? '' : 's'} · the P&L line each figure goes to`}>
      <div className="space-y-3 px-4 pb-4 text-sm">
        {c.pending && <p className="text-slate-700"><span className="font-semibold text-slate-900">Next step: </span>{c.pending}</p>}
        {c.files.map((f) => (
          <section key={f.slotId} className="rounded-lg border border-slate-200">
            <header className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-3 py-2">
              <span className="font-semibold text-slate-900">{f.label}</span>
              <StatusPill toneName={f.required ? 'brand' : 'neutral'} size="sm">{f.required ? 'Required' : 'Optional'}</StatusPill>
              <span className="text-xs text-slate-600">{f.cadence}</span>
            </header>
            <div className="space-y-2 px-3 py-2">
              <p className="text-slate-700"><span className="font-medium text-slate-900">The MIS reads: </span>{f.reads}</p>
              {f.exclusions && <p className="text-slate-700"><span className="font-medium text-slate-900">Left out: </span>{f.exclusions}</p>}
              <ul className="divide-y divide-slate-100 rounded-md bg-slate-50">
                {f.destinations.map((d, j) => (
                  <li key={j} className="px-3 py-1.5 text-xs">
                    <span className="font-semibold text-slate-900">{d.line}</span>
                    <span className="text-slate-600"> · {d.dimension}</span>
                    <span className="block text-slate-700">{d.rule}</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        ))}
      </div>
    </Disclosure>
  );
}
