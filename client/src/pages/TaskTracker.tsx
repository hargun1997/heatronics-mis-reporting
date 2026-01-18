import React, { useState, useEffect, useMemo } from 'react';
import {
  Task,
  TaskCompletion,
  TaskFrequency,
  TaskTrackerData,
  getCurrentPeriodKey,
  formatPeriod,
  generateTaskId
} from '../types/taskTracker';
import {
  loadTaskData,
  saveTaskData,
  addTask,
  deleteTask,
  markTaskComplete,
  unmarkTaskComplete,
  getTaskCompletion,
  getTasksSheetUrl
} from '../utils/taskStorage';

type ViewMode = 'all' | 'daily' | 'weekly' | 'monthly' | 'adhoc';

const frequencyLabels: Record<TaskFrequency, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  adhoc: 'Ad-hoc'
};

const frequencyColors: Record<TaskFrequency, string> = {
  daily: 'bg-blue-500/20 text-blue-400',
  weekly: 'bg-purple-500/20 text-purple-400',
  monthly: 'bg-emerald-500/20 text-emerald-400',
  adhoc: 'bg-orange-500/20 text-orange-400'
};

const categoryColors: Record<string, string> = {
  GST: 'bg-red-500/10 border-red-500/30',
  TDS: 'bg-purple-500/10 border-purple-500/30',
  Payroll: 'bg-emerald-500/10 border-emerald-500/30',
  Accounting: 'bg-blue-500/10 border-blue-500/30',
  Reporting: 'bg-yellow-500/10 border-yellow-500/30',
  Payments: 'bg-orange-500/10 border-orange-500/30',
  Receivables: 'bg-teal-500/10 border-teal-500/30',
  Banking: 'bg-indigo-500/10 border-indigo-500/30',
  Invoicing: 'bg-pink-500/10 border-pink-500/30',
  default: 'bg-slate-800/50 border-slate-700'
};

export function TaskTracker() {
  const [data, setData] = useState<TaskTrackerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('monthly');
  const [selectedPeriod, setSelectedPeriod] = useState<string>('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  // Load data on mount
  useEffect(() => {
    loadData();
  }, []);

  // Set initial period when data loads
  useEffect(() => {
    if (data && !selectedPeriod) {
      setSelectedPeriod(getCurrentPeriodKey(viewMode === 'all' ? 'monthly' : viewMode));
    }
  }, [data, viewMode]);

  const loadData = async () => {
    setLoading(true);
    const taskData = await loadTaskData();
    setData(taskData);
    setLoading(false);
  };

  // Filter tasks based on view mode
  const filteredTasks = useMemo(() => {
    if (!data) return [];
    if (viewMode === 'all') return data.tasks;
    return data.tasks.filter(task => task.frequency === viewMode);
  }, [data, viewMode]);

  // Get completion status for a task
  const getCompletionStatus = (taskId: string): TaskCompletion | undefined => {
    if (!data) return undefined;
    const period = getCurrentPeriodKey(
      data.tasks.find(t => t.id === taskId)?.frequency || 'monthly'
    );
    return getTaskCompletion(data.completions, taskId, period);
  };

  // Toggle task completion
  const toggleComplete = async (task: Task) => {
    const period = getCurrentPeriodKey(task.frequency);
    const existing = getTaskCompletion(data?.completions || [], task.id, period);

    if (existing?.status === 'completed') {
      await unmarkTaskComplete(task.id, period);
    } else {
      await markTaskComplete(task.id, period, 'completed');
    }
    await loadData();
  };

  // Handle adding a new task
  const handleAddTask = async (taskData: Omit<Task, 'id' | 'createdAt'>) => {
    await addTask(taskData);
    await loadData();
    setShowAddModal(false);
  };

  // Handle deleting a task
  const handleDeleteTask = async (taskId: string) => {
    if (confirm('Are you sure you want to delete this task?')) {
      await deleteTask(taskId);
      await loadData();
    }
  };

  // Calculate stats
  const stats = useMemo(() => {
    if (!data) return { total: 0, completed: 0, pending: 0 };

    const tasksToCount = viewMode === 'all' ? data.tasks : data.tasks.filter(t => t.frequency === viewMode);
    let completed = 0;

    tasksToCount.forEach(task => {
      const period = getCurrentPeriodKey(task.frequency);
      const completion = getTaskCompletion(data.completions, task.id, period);
      if (completion?.status === 'completed') completed++;
    });

    return {
      total: tasksToCount.length,
      completed,
      pending: tasksToCount.length - completed
    };
  }, [data, viewMode]);

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-slate-700 rounded w-1/4"></div>
          <div className="h-4 bg-slate-700 rounded w-1/2"></div>
          <div className="grid grid-cols-3 gap-4 mt-8">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-24 bg-slate-800 rounded-xl"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-semibold text-slate-100">Task Tracker</h1>
          <p className="text-slate-400 text-sm mt-1">Manage your accounting tasks and deadlines</p>
        </div>
        <div className="flex items-center gap-3">
          <a
            href={getTasksSheetUrl()}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-emerald-400 bg-emerald-500/20 border border-emerald-500/30 rounded-lg hover:bg-emerald-500/30 transition-colors"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
            Open Sheet
          </a>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-blue-400 bg-blue-500/20 border border-blue-500/30 rounded-lg hover:bg-blue-500/30 transition-colors"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Task
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="bg-slate-800/50 rounded-lg border border-slate-700 p-3">
          <div className="text-xs text-slate-400">Total Tasks</div>
          <div className="text-xl font-semibold text-slate-200 mt-0.5">{stats.total}</div>
        </div>
        <div className="bg-emerald-500/10 rounded-lg border border-emerald-500/30 p-3">
          <div className="text-xs text-slate-400">Completed</div>
          <div className="text-xl font-semibold text-emerald-400 mt-0.5">{stats.completed}</div>
        </div>
        <div className="bg-amber-500/10 rounded-lg border border-amber-500/30 p-3">
          <div className="text-xs text-slate-400">Pending</div>
          <div className="text-xl font-semibold text-amber-400 mt-0.5">{stats.pending}</div>
        </div>
      </div>

      {/* View Mode Tabs */}
      <div className="flex gap-2 mb-5 overflow-x-auto pb-2">
        {(['all', 'daily', 'weekly', 'monthly', 'adhoc'] as ViewMode[]).map((mode) => (
          <button
            key={mode}
            onClick={() => {
              setViewMode(mode);
              setSelectedPeriod(getCurrentPeriodKey(mode === 'all' ? 'monthly' : mode));
            }}
            className={`
              px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors
              ${viewMode === mode
                ? 'bg-slate-700 text-blue-400'
                : 'text-slate-400 hover:bg-slate-800 hover:text-slate-300'
              }
            `}
          >
            {mode === 'all' ? 'All Tasks' : frequencyLabels[mode]}
          </button>
        ))}
      </div>

      {/* Progress Bar */}
      {stats.total > 0 && (
        <div className="mb-5">
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="text-slate-400">Progress</span>
            <span className="font-medium text-slate-300">
              {stats.completed} / {stats.total} completed
            </span>
          </div>
          <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500 rounded-full transition-all duration-300"
              style={{ width: `${(stats.completed / stats.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Task List */}
      <div className="space-y-2">
        {filteredTasks.length === 0 ? (
          <div className="text-center py-12 bg-slate-800/50 rounded-xl border border-slate-700">
            <svg className="h-12 w-12 text-slate-600 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <p className="text-slate-400">No tasks found</p>
            <button
              onClick={() => setShowAddModal(true)}
              className="mt-4 text-blue-400 font-medium hover:text-blue-300"
            >
              Add your first task
            </button>
          </div>
        ) : (
          filteredTasks.map((task) => {
            const completion = getCompletionStatus(task.id);
            const isCompleted = completion?.status === 'completed';
            const categoryColor = categoryColors[task.category || ''] || categoryColors.default;

            return (
              <div
                key={task.id}
                className={`
                  rounded-lg border p-3 transition-all
                  ${isCompleted ? 'bg-emerald-500/10 border-emerald-500/30' : categoryColor}
                `}
              >
                <div className="flex items-start gap-3">
                  {/* Checkbox */}
                  <button
                    onClick={() => toggleComplete(task)}
                    className={`
                      flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors mt-0.5
                      ${isCompleted
                        ? 'bg-emerald-500 border-emerald-500 text-white'
                        : 'border-slate-500 hover:border-emerald-400'
                      }
                    `}
                  >
                    {isCompleted && (
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </button>

                  {/* Task Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className={`text-sm font-medium ${isCompleted ? 'text-slate-500 line-through' : 'text-slate-200'}`}>
                          {task.title}
                        </h3>
                        {task.description && (
                          <p className="text-xs text-slate-500 mt-0.5">{task.description}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${frequencyColors[task.frequency]}`}>
                          {frequencyLabels[task.frequency]}
                        </span>
                        {task.isRepeatable && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-slate-700 text-slate-400">
                            Repeatable
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Task Meta */}
                    <div className="flex items-center gap-4 mt-1.5 text-xs text-slate-500">
                      {task.category && (
                        <span className="flex items-center gap-1">
                          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                          </svg>
                          {task.category}
                        </span>
                      )}
                      {task.dueDay && task.frequency === 'monthly' && (
                        <span className="flex items-center gap-1">
                          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                          Due: {task.dueDay}{getDaySuffix(task.dueDay)} of month
                        </span>
                      )}
                      {isCompleted && completion?.completedAt && (
                        <span className="text-emerald-400">
                          Completed {new Date(completion.completedAt).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => setEditingTask(task)}
                      className="p-1.5 text-slate-500 hover:text-slate-300 hover:bg-slate-700/50 rounded-lg transition-colors"
                      title="Edit task"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => handleDeleteTask(task.id)}
                      className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                      title="Delete task"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Add/Edit Task Modal */}
      {(showAddModal || editingTask) && (
        <TaskModal
          task={editingTask}
          onClose={() => {
            setShowAddModal(false);
            setEditingTask(null);
          }}
          onSave={async (taskData) => {
            if (editingTask) {
              // Update existing task
              const updatedData = { ...data! };
              const index = updatedData.tasks.findIndex(t => t.id === editingTask.id);
              if (index >= 0) {
                updatedData.tasks[index] = { ...updatedData.tasks[index], ...taskData };
                await saveTaskData(updatedData);
              }
            } else {
              await handleAddTask(taskData);
            }
            await loadData();
            setShowAddModal(false);
            setEditingTask(null);
          }}
        />
      )}
    </div>
  );
}

// Helper function for day suffix
function getDaySuffix(day: number): string {
  if (day >= 11 && day <= 13) return 'th';
  switch (day % 10) {
    case 1: return 'st';
    case 2: return 'nd';
    case 3: return 'rd';
    default: return 'th';
  }
}

// Task Modal Component
interface TaskModalProps {
  task?: Task | null;
  onClose: () => void;
  onSave: (task: Omit<Task, 'id' | 'createdAt'>) => void;
}

function TaskModal({ task, onClose, onSave }: TaskModalProps) {
  const [title, setTitle] = useState(task?.title || '');
  const [description, setDescription] = useState(task?.description || '');
  const [frequency, setFrequency] = useState<TaskFrequency>(task?.frequency || 'monthly');
  const [isRepeatable, setIsRepeatable] = useState(task?.isRepeatable ?? true);
  const [dueDay, setDueDay] = useState(task?.dueDay?.toString() || '');
  const [category, setCategory] = useState(task?.category || '');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    onSave({
      title: title.trim(),
      description: description.trim() || undefined,
      frequency,
      isRepeatable,
      dueDay: dueDay ? parseInt(dueDay) : undefined,
      category: category.trim() || undefined
    });
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto border border-slate-700">
        <form onSubmit={handleSubmit}>
          <div className="p-5 border-b border-slate-700">
            <h2 className="text-lg font-semibold text-slate-100">
              {task ? 'Edit Task' : 'Add New Task'}
            </h2>
          </div>

          <div className="p-5 space-y-4">
            {/* Title */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                Task Title *
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-slate-200 placeholder-slate-500 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="e.g., GSTR-1 Filing"
                required
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-slate-200 placeholder-slate-500 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Optional description..."
                rows={2}
              />
            </div>

            {/* Frequency */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                Frequency
              </label>
              <select
                value={frequency}
                onChange={(e) => setFrequency(e.target.value as TaskFrequency)}
                className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="adhoc">Ad-hoc (One-time)</option>
              </select>
            </div>

            {/* Due Day (for monthly tasks) */}
            {frequency === 'monthly' && (
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  Due Day of Month
                </label>
                <input
                  type="number"
                  value={dueDay}
                  onChange={(e) => setDueDay(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-slate-200 placeholder-slate-500 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="e.g., 20 (for 20th of each month)"
                  min="1"
                  max="31"
                />
              </div>
            )}

            {/* Category */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                Category
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Select category...</option>
                <option value="GST">GST</option>
                <option value="TDS">TDS</option>
                <option value="Payroll">Payroll</option>
                <option value="Accounting">Accounting</option>
                <option value="Reporting">Reporting</option>
                <option value="Payments">Payments</option>
                <option value="Receivables">Receivables</option>
                <option value="Banking">Banking</option>
                <option value="Invoicing">Invoicing</option>
                <option value="Other">Other</option>
              </select>
            </div>

            {/* Repeatable */}
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="isRepeatable"
                checked={isRepeatable}
                onChange={(e) => setIsRepeatable(e.target.checked)}
                className="h-4 w-4 text-blue-500 focus:ring-blue-500 bg-slate-700 border-slate-600 rounded"
              />
              <label htmlFor="isRepeatable" className="text-sm text-slate-400">
                This task repeats every {frequency === 'adhoc' ? 'time' : frequency.replace('ly', '')}
              </label>
            </div>
          </div>

          <div className="p-5 border-t border-slate-700 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-300 bg-slate-700 rounded-lg hover:bg-slate-600 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-sm font-medium text-blue-400 bg-blue-500/20 border border-blue-500/30 rounded-lg hover:bg-blue-500/30 transition-colors"
            >
              {task ? 'Save Changes' : 'Add Task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
