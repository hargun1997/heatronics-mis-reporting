// Report client — saved recipients and sending the MIS report.

export interface MailerStatus { configured: boolean; provider: string; from: string | null; }
export interface SendResult { sent: boolean; dryRun: boolean; provider: string; to: string[]; error?: string; }

const json = async <T>(res: Response): Promise<T> => {
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error((body as { error?: string }).error || `Request failed (${res.status}).`);
  return body as T;
};

export const getRecipients = () =>
  fetch('/api/report/recipients').then((r) => json<{ emails: string[]; mailer: MailerStatus }>(r));

export const saveRecipients = (emails: string[]) =>
  fetch('/api/report/recipients', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ emails }) }).then((r) => json<{ emails: string[] }>(r));

export const sendReport = (subject: string, html: string, recipients?: string[]) =>
  fetch('/api/report/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subject, html, recipients }) }).then((r) => json<{ result: SendResult }>(r));
