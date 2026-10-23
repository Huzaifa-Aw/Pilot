export function allocationWeeksForRange(start: Date, end: Date) {
  const first = mondayFor(start);
  const last = mondayFor(end);
  const weeks: Date[] = [];
  for (const date = new Date(first); date <= last; date.setUTCDate(date.getUTCDate() + 7)) {
    weeks.push(new Date(date));
  }
  return weeks;
}

export function plannedHoursFromPercentage(percentage: number, capacityHrsPerWeek: number) {
  return roundTwo(capacityHrsPerWeek * percentage / 100);
}

export function percentageFromPlannedHours(plannedHours: number, capacityHrsPerWeek: number) {
  return capacityHrsPerWeek > 0
    ? roundTwo(plannedHours / capacityHrsPerWeek * 100)
    : 0;
}

function roundTwo(value: number) {
  return Math.round((value + Number.EPSILON * Math.abs(value)) * 100) / 100;
}

function mondayFor(date: Date) {
  const monday = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  return monday;
}
