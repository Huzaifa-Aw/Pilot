export function milestoneProgressPercent(completedTasks: number, totalTasks: number) {
  if (totalTasks <= 0) return 0;
  return Math.round(Math.min(Math.max(completedTasks, 0), totalTasks) / totalTasks * 100);
}
