// ----------------------------------------------------------------------------
// Send Report — mail the whole MIS to a list of people, on demand or monthly.
//
// The page builds a self-contained, animated HTML presentation of the live deck
// (buildPresentationHtml — the "Claude motion"), optionally with an executive
// summary Claude writes from the numbers. You can preview or download it, and
// send it to the saved recipient list. A monthly scheduler can hit
// /api/report/send-monthly to mail a server-composed summary automatically.
// ----------------------------------------------------------------------------

import { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '../../components/ui/PageHeader';
import { SectionCard } from '../../components/ui/Card';
import { loadLiveDeck, type LiveDeckData } from '../../data/misDeck/liveDeck';
import { buildLiveMisContext } from '../../data/chat/misContext';
import { chatStatus, sendChat } from '../../data/chat/chatClient';
import { buildPresentationHtml } from '../../data/report/presentation';
import { getRecipients, saveRecipients, sendReport, type MailerStatus, type SendResult } from '../../data/report/reportClient';
import { getOverview } from '../../data/ownership/ownershipClient';

const iconSend = (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
  </svg>
);

export function SendReportPage() {
  const [deck, setDeck] = useState<LiveDeckData | null>(null);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [mailer, setMailer] = useState<MailerStatus | null>(null);
  const [recipients, setRecipients] = useState<string[]>([]);
  const [teamEmails, setTeamEmails] = useState<string[]>([]);
  const [adhoc, setAdhoc] = useState('');

  const [summary, setSummary] = useState('');
  const [genBusy, setGenBusy] = useState(false);
  const [sendBusy, setSendBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<SendResult | null>(null);
  const [savedNote, setSavedNote] = useState(false);

  useEffect(() => {
    loadLiveDeck().then(setDeck).catch(() => setDeck(null));
    chatStatus().then((s) => setConfigured(s.configured)).catch(() => setConfigured(false));
    getRecipients().then((r) => { setRecipients(r.emails); setMailer(r.mailer); }).catch(() => {});
    getOverview().then((o) => setTeamEmails(o.members.map((m) => m.email))).catch(() => {});
  }, []);

  const title = 'Heatronics MIS';
  const html = useMemo(() => (deck ? buildPresentationHtml(deck, { title, summary: summary || undefined }) : ''), [deck, summary]);

  const toggleRecipient = (email: string) =>
    setRecipients((prev) => (prev.includes(email) ? prev.filter((e) => e !== email) : [...prev, email]));

  const addAdhoc = () => {
    const e = adhoc.trim().toLowerCase();
    if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e) && !recipients.includes(e)) { setRecipients([...recipients, e]); setAdhoc(''); }
  };

  const generateSummary = async () => {
    if (genBusy || configured === false || !deck) return;
    setGenBusy(true); setError(null);
    try {
      const { context } = buildLiveMisContext(deck);
      const prompt =
        'Write a tight executive summary of this MIS for the leadership team. 4–7 short bullets: ' +
        'headline revenue and its trend, margin health (gross margin % and CM2 %), where the money is being made or lost, ' +
        'notable movements, and one or two things to watch. Use the latest complete month and cite ₹ figures. ' +
        'Plain, direct, no preamble.';
      setSummary(await sendChat(context, [{ role: 'user', content: prompt }]));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Summary failed.');
    } finally {
      setGenBusy(false);
    }
  };

  const preview = () => {
    if (!html) return;
    const blob = new Blob([html], { type: 'text/html' });
    window.open(URL.createObjectURL(blob), '_blank', 'noopener');
  };
  const download = () => {
    if (!html) return;
    const blob = new Blob([html], { type: 'text/html' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `heatronics-mis-${new Date().toISOString().slice(0, 10)}.html`;
    a.click();
  };

  const saveList = async () => {
    try { await saveRecipients(recipients); setSavedNote(true); setTimeout(() => setSavedNote(false), 2000); }
    catch (e) { setError(e instanceof Error ? e.message : 'Save failed.'); }
  };

  const doSend = async () => {
    if (sendBusy || !html || recipients.length === 0) return;
    setSendBusy(true); setError(null); setSent(null);
    try {
      await saveRecipients(recipients); // persist whoever is selected
      const { result } = await sendReport(`${title} — ${new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}`, html, recipients);
      setSent(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Send failed.');
    } finally {
      setSendBusy(false);
    }
  };

  const allEmails = [...new Set([...teamEmails, ...recipients])];

  return (
    <>
      <PageHeader
        title="Send Report"
        accent="brand"
        icon={iconSend}
        description="Mail the whole MIS — an animated presentation plus an AI executive summary — to your people, on demand or monthly."
        crumbs={[{ label: 'Reporting', to: '/reporting' }, { label: 'MIS Reporting', to: '/reporting/mis' }, { label: 'Send Report' }]}
      />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</div>}

        {mailer && !mailer.configured && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            No email provider is configured, so <b>Send</b> runs in preview mode (nothing is delivered). You can still preview/download the
            presentation. Set <span className="font-mono">RESEND_API_KEY</span> + <span className="font-mono">MAIL_FROM</span> (or Mailgun) on the server to send for real.
          </div>
        )}

        <SectionCard title="Recipients" description="Pick from your team or add any email. This list is saved and reused for the monthly send.">
          <div className="flex flex-wrap gap-1.5">
            {allEmails.length === 0 && <span className="text-xs text-slate-400">No team members yet — add emails below, or set them up on the Ownership page.</span>}
            {allEmails.map((e) => {
              const on = recipients.includes(e);
              return (
                <button key={e} onClick={() => toggleRecipient(e)}
                  className={`text-xs rounded-full border px-2.5 py-1 ${on ? 'bg-brand-500 text-white border-brand-500' : 'bg-white text-slate-600 border-slate-200 hover:border-brand-300'}`}>
                  {e}
                </button>
              );
            })}
          </div>
          <div className="mt-3 flex items-center gap-2">
            <input value={adhoc} onChange={(e) => setAdhoc(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addAdhoc(); } }}
              type="email" placeholder="add an email…" className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400/40" />
            <button onClick={addAdhoc} className="rounded-lg border border-slate-200 text-sm px-3 py-1.5 text-slate-600 hover:bg-slate-50">Add</button>
            <button onClick={saveList} className="rounded-lg border border-slate-200 text-sm px-3 py-1.5 text-slate-600 hover:bg-slate-50">Save list</button>
            {savedNote && <span className="text-[11px] text-emerald-600">saved</span>}
            <span className="ml-auto text-[11px] text-slate-400">{recipients.length} selected</span>
          </div>
        </SectionCard>

        <SectionCard
          title="Executive summary"
          description="Optional — Claude writes a short summary from the live numbers and puts it at the top of the report."
          actions={
            <button onClick={() => void generateSummary()} disabled={genBusy || configured === false || !deck}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 text-xs font-medium px-3 py-1.5 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              title={configured === false ? 'Claude API key not set on the server' : ''}>
              <svg className="w-4 h-4 text-brand-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
              {genBusy ? 'Writing…' : summary ? 'Regenerate' : 'Generate summary'}
            </button>
          }
        >
          <textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={summary ? 8 : 3}
            placeholder="Generate with Claude, or type your own. Leave blank to send without a summary."
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400/40" />
        </SectionCard>

        <SectionCard title="Presentation" description="An animated, self-contained page built from the live deck.">
          <div className="flex flex-wrap gap-2">
            <button onClick={preview} disabled={!deck} className="rounded-lg border border-slate-200 text-sm px-3.5 py-2 text-slate-700 hover:bg-slate-50 disabled:opacity-50">Preview</button>
            <button onClick={download} disabled={!deck} className="rounded-lg border border-slate-200 text-sm px-3.5 py-2 text-slate-700 hover:bg-slate-50 disabled:opacity-50">Download .html</button>
            <button onClick={() => void doSend()} disabled={sendBusy || !deck || recipients.length === 0}
              className="ml-auto inline-flex items-center gap-2 rounded-lg bg-brand-500 text-white text-sm font-medium px-3.5 py-2 hover:bg-brand-600 disabled:opacity-50">
              {sendBusy ? <span className="inline-block w-3.5 h-3.5 rounded-full border-2 border-white/60 border-t-transparent animate-spin" /> : iconSend}
              Send to {recipients.length || 'nobody'}
            </button>
          </div>
          {sent && (
            <div className={`mt-3 text-xs rounded-lg px-3 py-2 border ${sent.sent ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : sent.dryRun ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-rose-200 bg-rose-50 text-rose-700'}`}>
              {sent.sent ? `Sent to ${sent.to.join(', ')}.` : sent.dryRun ? `Preview only (email not configured) — would send to ${sent.to.join(', ')}.` : `Failed: ${sent.error ?? 'unknown error'}`}
            </div>
          )}
        </SectionCard>

        <p className="text-[10px] text-slate-400">
          Monthly auto-send: point a monthly Cloud Scheduler job at <span className="font-mono">POST /api/report/send-monthly</span> — it emails a server-composed
          summary + a link to the full report to this saved recipient list. (Needs the email provider configured.)
        </p>
      </div>
    </>
  );
}
