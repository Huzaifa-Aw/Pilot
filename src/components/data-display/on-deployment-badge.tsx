import { DeploymentStatus } from "@prisma/client";
import { isDeploymentActiveOnDate } from "@/lib/deployment-conflicts";

export function OnDeploymentBadge({
  status,
  startDate,
  endDate,
  location,
}: {
  status: DeploymentStatus;
  startDate: Date;
  endDate: Date;
  location: string;
}) {
  if (!isDeploymentActiveOnDate({ status, startDate, endDate }, new Date())) return null;
  const end = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" }).format(endDate);
  return (
    <span
      title={`On deployment at ${location} until ${end}`}
      className="inline-flex min-h-6 items-center rounded-full bg-info-light px-2.5 text-xs font-medium text-brand-primary"
    >
      On deployment
    </span>
  );
}
