import {
  Activity, Archive, BookCheck, BookOpen, CalendarRange, CheckSquare, Database, Sunrise, Hourglass, FileUp, IndianRupee, Landmark, ListChecks, ReceiptIndianRupee,
  ReceiptText, Send, ShieldAlert, Sparkles, TrendingUp, Users, Wrench, type LucideIcon,
} from 'lucide-react';
import type { NavIconName } from '../../nav/config';

export const NAV_ICON: Record<NavIconName, LucideIcon> = {
  today: Sunrise,
  cash: Hourglass,
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
  payments: Landmark,
  sources: Database,
  rules: ListChecks,
  people: Users,
  tally: BookCheck,
  tds: ReceiptIndianRupee,
  old: Archive,
};
