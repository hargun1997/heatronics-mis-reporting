// Task Tracker Storage Utility
// Uses Google Sheets API with Apps Script Web App for persistence

import { Task, TaskCompletion, TaskTrackerData, generateTaskId } from '../types/taskTracker';

// Google Sheet ID (same sheet as MIS data)
const SHEET_ID = '1CgClltIfhvQMZ9kxQ2MqfcebyZzDoZdg6i2evHAo3JI';
const TASKS_SHEET_NAME = 'Tasks';

// Local storage keys (fallback)
const TASKS_STORAGE_KEY = 'heatronics_tasks';
const COMPLETIONS_STORAGE_KEY = 'heatronics_task_completions';

// Google Sheets API URL (using visualization API for reading public sheets)
const SHEETS_API_BASE = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq`;

// ============================================
// LOCAL STORAGE FUNCTIONS
// ============================================

function loadFromLocalStorage(): TaskTrackerData {
  try {
    const tasksJson = localStorage.getItem(TASKS_STORAGE_KEY);
    const completionsJson = localStorage.getItem(COMPLETIONS_STORAGE_KEY);

    return {
      version: '1.0',
      lastUpdated: new Date().toISOString(),
      tasks: tasksJson ? JSON.parse(tasksJson) : getDefaultTasks(),
      completions: completionsJson ? JSON.parse(completionsJson) : []
    };
  } catch (error) {
    console.error('Error loading from localStorage:', error);
    return {
      version: '1.0',
      lastUpdated: new Date().toISOString(),
      tasks: getDefaultTasks(),
      completions: []
    };
  }
}

function saveToLocalStorage(data: TaskTrackerData): boolean {
  try {
    localStorage.setItem(TASKS_STORAGE_KEY, JSON.stringify(data.tasks));
    localStorage.setItem(COMPLETIONS_STORAGE_KEY, JSON.stringify(data.completions));
    return true;
  } catch (error) {
    console.error('Error saving to localStorage:', error);
    return false;
  }
}

// ============================================
// GOOGLE SHEETS INTEGRATION
// ============================================

interface SheetRow {
  id: string;
  title: string;
  description: string;
  frequency: string;
  isRepeatable: string;
  dueDay: string;
  category: string;
  createdAt: string;
}

async function fetchFromGoogleSheets(): Promise<Task[] | null> {
  try {
    // Using the visualization API to read public sheets
    const url = `${SHEETS_API_BASE}?sheet=${encodeURIComponent(TASKS_SHEET_NAME)}&tqx=out:json`;
    const response = await fetch(url);

    if (!response.ok) {
      console.warn('Could not fetch from Google Sheets, using local storage');
      return null;
    }

    const text = await response.text();
    // The response is JSONP, need to extract the JSON part
    const jsonMatch = text.match(/google\.visualization\.Query\.setResponse\(([\s\S]*)\);/);
    if (!jsonMatch) {
      console.warn('Invalid response format from Google Sheets');
      return null;
    }

    const data = JSON.parse(jsonMatch[1]);

    if (!data.table || !data.table.rows || data.table.rows.length === 0) {
      return [];
    }

    // Extract column headers
    const headers = data.table.cols.map((col: any) => col.label || col.id);

    // Parse rows
    const tasks: Task[] = data.table.rows.map((row: any) => {
      const values = row.c.map((cell: any) => cell?.v ?? '');
      const taskData: any = {};
      headers.forEach((header: string, index: number) => {
        taskData[header.toLowerCase().replace(/\s/g, '')] = values[index];
      });

      return {
        id: taskData.id || generateTaskId(),
        title: taskData.title || '',
        description: taskData.description || '',
        frequency: taskData.frequency || 'monthly',
        isRepeatable: taskData.isrepeatable === 'TRUE' || taskData.isrepeatable === true,
        dueDay: taskData.dueday ? parseInt(taskData.dueday) : undefined,
        category: taskData.category || '',
        createdAt: taskData.createdat || new Date().toISOString()
      } as Task;
    }).filter((task: Task) => task.title); // Filter out empty rows

    return tasks;
  } catch (error) {
    console.error('Error fetching from Google Sheets:', error);
    return null;
  }
}

// ============================================
// PUBLIC API
// ============================================

export async function loadTaskData(): Promise<TaskTrackerData> {
  // Try Google Sheets first
  const sheetTasks = await fetchFromGoogleSheets();

  if (sheetTasks && sheetTasks.length > 0) {
    // Merge with local completions
    const localData = loadFromLocalStorage();
    return {
      version: '1.0',
      lastUpdated: new Date().toISOString(),
      tasks: sheetTasks,
      completions: localData.completions
    };
  }

  // Fall back to local storage
  return loadFromLocalStorage();
}

export async function saveTaskData(data: TaskTrackerData): Promise<boolean> {
  data.lastUpdated = new Date().toISOString();
  return saveToLocalStorage(data);
}

export async function addTask(task: Omit<Task, 'id' | 'createdAt'>): Promise<Task> {
  const newTask: Task = {
    ...task,
    id: generateTaskId(),
    createdAt: new Date().toISOString()
  };

  const data = await loadTaskData();
  data.tasks.push(newTask);
  await saveTaskData(data);

  return newTask;
}

export async function updateTask(taskId: string, updates: Partial<Task>): Promise<boolean> {
  const data = await loadTaskData();
  const index = data.tasks.findIndex(t => t.id === taskId);

  if (index === -1) return false;

  data.tasks[index] = { ...data.tasks[index], ...updates };
  return await saveTaskData(data);
}

export async function deleteTask(taskId: string): Promise<boolean> {
  const data = await loadTaskData();
  data.tasks = data.tasks.filter(t => t.id !== taskId);
  // Also remove associated completions
  data.completions = data.completions.filter(c => c.taskId !== taskId);
  return await saveTaskData(data);
}

export async function markTaskComplete(
  taskId: string,
  period: string,
  status: 'completed' | 'skipped' = 'completed',
  notes?: string
): Promise<boolean> {
  const data = await loadTaskData();

  // Find existing completion or create new
  const existingIndex = data.completions.findIndex(
    c => c.taskId === taskId && c.period === period
  );

  const completion: TaskCompletion = {
    taskId,
    period,
    status,
    completedAt: new Date().toISOString(),
    notes
  };

  if (existingIndex >= 0) {
    data.completions[existingIndex] = completion;
  } else {
    data.completions.push(completion);
  }

  return await saveTaskData(data);
}

export async function unmarkTaskComplete(taskId: string, period: string): Promise<boolean> {
  const data = await loadTaskData();
  data.completions = data.completions.filter(
    c => !(c.taskId === taskId && c.period === period)
  );
  return await saveTaskData(data);
}

export function getTaskCompletion(
  completions: TaskCompletion[],
  taskId: string,
  period: string
): TaskCompletion | undefined {
  return completions.find(c => c.taskId === taskId && c.period === period);
}

// ============================================
// DEFAULT TASKS
// ============================================

function getDefaultTasks(): Task[] {
  const now = new Date().toISOString();

  return [
    // Monthly Tasks
    {
      id: 'task_default_1',
      title: 'GSTR-1 Filing',
      description: 'File GSTR-1 return for outward supplies',
      frequency: 'monthly',
      isRepeatable: true,
      dueDay: 11,
      category: 'GST',
      createdAt: now
    },
    {
      id: 'task_default_2',
      title: 'GSTR-3B Filing',
      description: 'File GSTR-3B summary return and pay GST',
      frequency: 'monthly',
      isRepeatable: true,
      dueDay: 20,
      category: 'GST',
      createdAt: now
    },
    {
      id: 'task_default_3',
      title: 'TDS Payment',
      description: 'Pay TDS challan for the previous month',
      frequency: 'monthly',
      isRepeatable: true,
      dueDay: 7,
      category: 'TDS',
      createdAt: now
    },
    {
      id: 'task_default_4',
      title: 'PF Payment',
      description: 'Pay Employee Provident Fund contribution',
      frequency: 'monthly',
      isRepeatable: true,
      dueDay: 15,
      category: 'Payroll',
      createdAt: now
    },
    {
      id: 'task_default_5',
      title: 'ESI Payment',
      description: 'Pay Employee State Insurance contribution',
      frequency: 'monthly',
      isRepeatable: true,
      dueDay: 15,
      category: 'Payroll',
      createdAt: now
    },
    {
      id: 'task_default_6',
      title: 'Bank Reconciliation',
      description: 'Reconcile all bank accounts',
      frequency: 'monthly',
      isRepeatable: true,
      dueDay: 5,
      category: 'Accounting',
      createdAt: now
    },
    {
      id: 'task_default_7',
      title: 'Generate MIS Report',
      description: 'Generate monthly P&L statement',
      frequency: 'monthly',
      isRepeatable: true,
      dueDay: 10,
      category: 'Reporting',
      createdAt: now
    },

    // Weekly Tasks
    {
      id: 'task_default_8',
      title: 'Vendor Payment Review',
      description: 'Review and process pending vendor payments',
      frequency: 'weekly',
      isRepeatable: true,
      dueDay: 5, // Friday
      category: 'Payments',
      createdAt: now
    },
    {
      id: 'task_default_9',
      title: 'Invoice Follow-up',
      description: 'Follow up on pending customer invoices',
      frequency: 'weekly',
      isRepeatable: true,
      dueDay: 1, // Monday
      category: 'Receivables',
      createdAt: now
    },

    // Daily Tasks
    {
      id: 'task_default_10',
      title: 'Check Bank Transactions',
      description: 'Review daily bank transactions and update books',
      frequency: 'daily',
      isRepeatable: true,
      category: 'Banking',
      createdAt: now
    },
    {
      id: 'task_default_11',
      title: 'Process Sales Invoices',
      description: 'Generate and send sales invoices',
      frequency: 'daily',
      isRepeatable: true,
      category: 'Invoicing',
      createdAt: now
    }
  ];
}

// ============================================
// SYNC TO GOOGLE SHEETS
// ============================================

export function getGoogleSheetsUrl(): string {
  return `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit#gid=0`;
}

export function getTasksSheetUrl(): string {
  return `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit?gid=0#gid=0`;
}
