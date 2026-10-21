type CapacityMember = {
  id: string;
  name: string;
  title: string | null;
};

export function CapacityHeatmap({
  members,
  weeks,
  allocations,
}: {
  members: CapacityMember[];
  weeks: string[];
  allocations: Record<string, Record<string, number>>;
}) {
  if (!members.length) return null;

  return (
    <section aria-labelledby="capacity-title" className="rounded-lg border border-border-default bg-surface">
      <div className="border-b border-border-default px-4 py-4 sm:px-5">
        <h2 id="capacity-title" className="font-heading text-base font-semibold text-text-primary">Upcoming capacity</h2>
        <p className="mt-1 text-sm text-text-muted">Weekly planned allocations across your active members.</p>
      </div>
      <ul className="divide-y divide-border-default md:hidden">
        {members.map((member) => (
          <li key={member.id} className="px-4 py-4">
            <div className="flex items-baseline justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-text-primary">{member.name}</p>
                <p className="mt-0.5 truncate text-xs text-text-muted">{member.title ?? "Organization member"}</p>
              </div>
              <span className="shrink-0 text-xs text-text-muted">Week by week</span>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {weeks.map((week, index) => {
                const percentage = allocations[member.id]?.[week] ?? 0;
                return (
                  <div key={week} className="flex min-h-11 items-center justify-between gap-1 rounded-md bg-neutral-50 px-2 text-xs">
                    <span className="text-text-muted">W{index + 1}</span>
                    <span className={capacityText(percentage)}>{percentage.toFixed(0)}%</span>
                  </div>
                );
              })}
            </div>
          </li>
        ))}
      </ul>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[760px] border-collapse text-left text-sm">
          <thead className="bg-neutral-50 text-xs font-semibold uppercase tracking-wider text-text-muted">
            <tr>
              <th scope="col" className="sticky left-0 bg-neutral-50 px-4 py-3 sm:px-5">Member</th>
              {weeks.map((week, index) => (
                <th scope="col" key={week} className="px-2 py-3 text-center">W{index + 1}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border-default">
            {members.map((member) => (
              <tr key={member.id} className="hover:bg-neutral-50">
                <th scope="row" className="sticky left-0 bg-surface px-4 py-3 text-left sm:px-5">
                  <span className="block max-w-48 truncate text-sm font-semibold text-text-primary">{member.name}</span>
                  <span className="mt-0.5 block max-w-48 truncate text-xs font-normal text-text-muted">{member.title ?? "Organization member"}</span>
                </th>
                {weeks.map((week) => {
                  const percentage = allocations[member.id]?.[week] ?? 0;
                  return (
                    <td key={week} className="px-2 py-3 text-center">
                      <span className={`inline-flex min-h-8 min-w-12 items-center justify-center rounded-md px-2 text-xs font-semibold ${capacityCell(percentage)}`}>
                        {percentage.toFixed(0)}%
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border-default px-4 py-3 text-xs text-text-muted sm:px-5">
        <span><span className="mr-1 inline-block size-2 rounded-sm bg-neutral-200" />0–49%</span>
        <span><span className="mr-1 inline-block size-2 rounded-sm bg-info-light" />50–74%</span>
        <span><span className="mr-1 inline-block size-2 rounded-sm bg-brand-primary" />75–100%</span>
        <span><span className="mr-1 inline-block size-2 rounded-sm bg-error" />Over 100%</span>
      </div>
    </section>
  );
}

function capacityCell(percentage: number) {
  if (percentage > 100) return "bg-error text-white animate-pulse";
  if (percentage >= 75) return "bg-brand-primary text-white";
  if (percentage >= 50) return "bg-info-light text-info-dark";
  return "bg-neutral-100 text-neutral-700";
}

function capacityText(percentage: number) {
  return percentage > 100 ? "font-semibold text-error-dark" : "font-semibold text-text-primary";
}
