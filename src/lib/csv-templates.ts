import { serializeCsvRow } from "@/lib/csv";

export const allocationsCsvTemplate = [
  serializeCsvRow(["memberEmail", "projectCode", "weekStartDate", "plannedHrs", "allocationPct", "mode", "notes"]),
  serializeCsvRow(["member@example.test", "PRJ-101", "2026-11-02", "16", "40", "Remote", "Capacity planning"]),
].join("\n");

export const worklogsCsvTemplate = [
  serializeCsvRow(["externalKey", "memberEmail", "date", "hours", "projectCode", "taskNumber", "description"]),
  serializeCsvRow(["import-001", "member@example.test", "2026-11-02", "2.5", "PRJ-101", "12", "Project planning"]),
].join("\n");

export const deploymentsCsvTemplate = [
  serializeCsvRow(["deploymentId", "memberEmails", "projectCode", "location", "title", "deploymentType", "country", "startDate", "endDate", "status", "notes"]),
  serializeCsvRow(["", "member@example.test", "PRJ-101", "Site A", "Field review", "On-site", "Example region", "2026-11-02", "2026-11-06", "UPCOMING", ""]),
].join("\n");

export const taskCsvTemplate = [
  serializeCsvRow(["projectCode", "taskNumber", "title", "description", "priority", "status", "milestoneSequence", "startDate", "dueDate", "estimatedHrs", "actualHrs", "requiredDiscipline", "assigneeEmails", "labels", "parentTaskNumber", "blockedByTaskNumber"]),
  serializeCsvRow(["PRJ-101", "12", "Review deliverables", "", "MEDIUM", "BACKLOG", "", "", "2026-11-13", "8", "0", "", "member@example.test", "Planning", "", ""]),
].join("\n");
