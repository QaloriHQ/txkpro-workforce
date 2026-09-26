"use client";

import Link from "next/link";
import { AcademicCapIcon, HomeIcon } from "@heroicons/react/24/outline";

type StudentSection = "workspace" | "training";

export function StudentWorkspaceNav({
  active,
  trainingCount = 0,
}: {
  active: StudentSection;
  trainingCount?: number;
}) {
  const items = [
    {
      key: "workspace" as const,
      href: "/student",
      label: "Workspace",
      icon: HomeIcon,
    },
    {
      key: "training" as const,
      href: "/student/employer-training",
      label: "Employer Training",
      icon: AcademicCapIcon,
      count: trainingCount,
    },
  ];

  return (
    <nav className="student-workspace-nav" aria-label="Student workspace">
      {items.map((item) => {
        const Icon = item.icon;
        const selected = active === item.key;
        return (
          <Link
            key={item.key}
            href={item.href}
            className={"student-workspace-nav-link " + (selected ? "active" : "")}
            aria-current={selected ? "page" : undefined}
          >
            <Icon aria-hidden="true" />
            <span>{item.label}</span>
            {"count" in item && item.count ? (
              <strong aria-label={String(item.count) + " Employer Training assignments"}>
                {item.count}
              </strong>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
