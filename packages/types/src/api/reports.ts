import type { TaskStatus } from '../workflow/task-status';

/** One line of a person's daily report: a task they logged time on or completed that day. */
export interface DailyReportItem {
  taskId: string;
  /** "<project code>-<number>" */
  taskKey: string;
  title: string;
  projectId: string;
  projectName: string;
  status: TaskStatus;
  minutes: number;
  /** Work-log summaries for the day, newest last. */
  summaries: string[];
  completedToday: boolean;
  submittedForReviewToday: boolean;
  clientVisible: boolean;
}

/** Stored as JSON in daily_reports.snapshot and returned by GET /reports/daily. */
export interface DailyReportSnapshot {
  minutesLogged: number;
  tasksCompleted: number;
  tasksSubmitted: number;
  tasksWorkedOn: number;
  items: DailyReportItem[];
}

export interface DailyReportResponse {
  userId: string;
  userName: string;
  reportDate: string;
  generatedAt: string;
  snapshot: DailyReportSnapshot;
}
