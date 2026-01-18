// Task Tracker Types

export type TaskFrequency = 'daily' | 'weekly' | 'monthly' | 'adhoc';
export type TaskStatus = 'pending' | 'completed' | 'skipped';

export interface Task {
  id: string;
  title: string;
  description?: string;
  frequency: TaskFrequency;
  isRepeatable: boolean;
  dueDay?: number; // For monthly tasks: 1-31, For weekly: 0-6 (Sunday-Saturday)
  createdAt: string;
  category?: string;
}

export interface TaskCompletion {
  taskId: string;
  period: string; // Format: YYYY-MM for monthly, YYYY-WW for weekly, YYYY-MM-DD for daily
  status: TaskStatus;
  completedAt?: string;
  notes?: string;
}

export interface TaskTrackerData {
  version: string;
  lastUpdated: string;
  tasks: Task[];
  completions: TaskCompletion[];
}

// Helper to generate period keys
export function getCurrentPeriodKey(frequency: TaskFrequency): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');

  switch (frequency) {
    case 'daily':
      return `${year}-${month}-${day}`;
    case 'weekly':
      const weekNumber = getWeekNumber(now);
      return `${year}-W${String(weekNumber).padStart(2, '0')}`;
    case 'monthly':
      return `${year}-${month}`;
    case 'adhoc':
      return `${year}-${month}-${day}`;
    default:
      return `${year}-${month}`;
  }
}

export function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

export function formatPeriod(periodKey: string, frequency: TaskFrequency): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  if (frequency === 'monthly') {
    const [year, month] = periodKey.split('-');
    return `${months[parseInt(month) - 1]} ${year}`;
  } else if (frequency === 'weekly') {
    const [year, week] = periodKey.split('-W');
    return `Week ${week}, ${year}`;
  } else {
    const [year, month, day] = periodKey.split('-');
    return `${months[parseInt(month) - 1]} ${parseInt(day)}, ${year}`;
  }
}

export function generateTaskId(): string {
  return `task_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}
