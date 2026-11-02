import {
  Activity, Archive, BookOpen, CalendarRange, CheckSquare, Database, FileUp, IndianRupee, ListChecks,
  ReceiptText, Send, ShieldAlert, Sparkles, TrendingUp, Users, Wrench, type LucideIcon,
} from 'lucide-react';
import type { NavIconName } from '../../nav/config';

export const NAV_ICON: Record<NavIconName, LucideIcon> = {
  live: Activity,
  upload: FileUp,
  issues: ShieldAlert,
  ai: Sparkles,
  send: Send,
  tasks: CheckSquare,
  booking: ReceiptText,
  book: BookOpen,
  tools: Wrench,
  plan: TrendingUp,
  rounds: CalendarRange,
  floors: IndianRupee,
  sources: Database,
  rules: ListChecks,
  people: Users,
  tally: ListChecks,
  old: Archive,
};
