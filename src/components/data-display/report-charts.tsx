"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const statusColors: Record<string, string> = {
  BACKLOG: "var(--color-neutral-400)",
  IN_PROGRESS: "var(--color-progress-dot)",
  UNDER_REVIEW: "var(--color-warning)",
  APPROVED: "var(--color-success)",
  COMPLETED: "var(--color-success-dark)",
  CANCELLED: "var(--color-error)",
};

export function TaskStatusChart({ data }: { data: Array<{ status: string; count: number }> }) {
  return (
    <figure className="rounded-lg border border-border-default bg-surface p-4 sm:p-5">
      <figcaption className="text-sm font-semibold text-text-primary">Tasks by status</figcaption>
      <div className="mt-3 h-64" role="img" aria-label={`Task status distribution: ${data.map((item) => `${item.status.replaceAll("_", " ")} ${item.count}`).join(", ") || "no tasks"}`}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="count" nameKey="status" innerRadius="52%" outerRadius="78%" paddingAngle={2}>
              {data.map((item) => <Cell key={item.status} fill={statusColors[item.status] ?? "var(--color-brand-primary)"} />)}
            </Pie>
            <Tooltip formatter={(value) => [`${value ?? 0} tasks`, "Count"]} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ChartTable data={data} />
    </figure>
  );
}

export function ProjectTaskChart({ data }: { data: Array<{ project: string; tasks: number; overdue: number }> }) {
  return (
    <figure className="rounded-lg border border-border-default bg-surface p-4 sm:p-5">
      <figcaption className="text-sm font-semibold text-text-primary">Project task load</figcaption>
      <div className="mt-3 h-64" role="img" aria-label={`Project task load: ${data.map((item) => `${item.project}: ${item.tasks} tasks, ${item.overdue} overdue`).join("; ") || "no projects"}`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 26 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border-default)" />
            <XAxis dataKey="project" tick={{ fontSize: 10 }} interval={0} angle={-25} textAnchor="end" />
            <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
            <Tooltip />
            <Bar dataKey="tasks" name="Tasks" fill="var(--color-brand-primary)" radius={[4, 4, 0, 0]} />
            <Bar dataKey="overdue" name="Overdue" fill="var(--color-error)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <table className="sr-only"><caption>Project task load data</caption><thead><tr><th>Project</th><th>Tasks</th><th>Overdue</th></tr></thead><tbody>{data.map((item) => <tr key={item.project}><th>{item.project}</th><td>{item.tasks}</td><td>{item.overdue}</td></tr>)}</tbody></table>
    </figure>
  );
}

export function ProjectHoursChart({ data }: { data: Array<{ project: string; estimated: number; actual: number }> }) {
  return (
    <figure className="rounded-lg border border-border-default bg-surface p-4 sm:p-5">
      <figcaption className="text-sm font-semibold text-text-primary">Estimated vs. actual task hours</figcaption>
      <div className="mt-3 h-64" role="img" aria-label={`Estimated and actual hours by project: ${data.map((item) => `${item.project}: ${item.estimated} estimated, ${item.actual} actual`).join("; ")}`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 26 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border-default)" />
            <XAxis dataKey="project" tick={{ fontSize: 10 }} interval={0} angle={-25} textAnchor="end" />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip formatter={(value) => [`${value ?? 0}h`, "Hours"]} />
            <Bar dataKey="estimated" name="Estimated" fill="var(--color-neutral-400)" radius={[4, 4, 0, 0]} />
            <Bar dataKey="actual" name="Actual" fill="var(--color-brand-primary)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <table className="sr-only"><caption>Estimated and actual hours by project</caption><thead><tr><th>Project</th><th>Estimated</th><th>Actual</th></tr></thead><tbody>{data.map((item) => <tr key={item.project}><th>{item.project}</th><td>{item.estimated}</td><td>{item.actual}</td></tr>)}</tbody></table>
    </figure>
  );
}

export function ThroughputChart({ data }: { data: Array<{ week: string; completed: number }> }) {
  return (
    <figure className="rounded-lg border border-border-default bg-surface p-4 sm:p-5">
      <figcaption className="text-sm font-semibold text-text-primary">Completed tasks per week</figcaption>
      <div className="mt-3 h-64" role="img" aria-label={`Weekly task throughput: ${data.map((item) => `${item.week}: ${item.completed}`).join(", ")}`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 12 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border-default)" />
            <XAxis dataKey="week" tick={{ fontSize: 10 }} interval={1} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
            <Tooltip />
            <Bar dataKey="completed" name="Completed" fill="var(--color-success)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <table className="sr-only"><caption>Weekly task throughput</caption><thead><tr><th>Week</th><th>Completed tasks</th></tr></thead><tbody>{data.map((item) => <tr key={item.week}><th>{item.week}</th><td>{item.completed}</td></tr>)}</tbody></table>
    </figure>
  );
}

function ChartTable({ data }: { data: Array<{ status: string; count: number }> }) {
  return <table className="sr-only"><caption>Task status distribution data</caption><thead><tr><th>Status</th><th>Tasks</th></tr></thead><tbody>{data.map((item) => <tr key={item.status}><th>{item.status.replaceAll("_", " ")}</th><td>{item.count}</td></tr>)}</tbody></table>;
}
