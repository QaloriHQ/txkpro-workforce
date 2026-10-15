"use client";

import Link from "next/link";
import {
  PlayCircleIcon,
  ChatBubbleLeftRightIcon,
  HomeIcon,
  BriefcaseIcon,
  UserGroupIcon,
} from "@heroicons/react/24/outline";

type StudentSection =
  | "home"
  | "workspace"
  | "training"
  | "opportunities"
  | "portfolio"
  | "profile"
  | "feed"
  | "messages";

export function StudentWorkspaceNav({
  active,
  trainingCount = 0,
}: {
  active: StudentSection;
  trainingCount?: number;
}) {
  const items = [
    {
      key: "home" as const,
      href: "/student/community",
      label: "Community",
      icon: UserGroupIcon,
    },
    {
      key: "workspace" as const,
      href: "/student",
      label: "Workspace",
      icon: HomeIcon,
    },
    {
      key: "training" as const,
      href: "/student/employer-training",
      label: "Training",
      icon: PlayCircleIcon,
      count: trainingCount,
    },
    {
      key: "opportunities" as const,
      href: "/student/opportunities",
      label: "Career",
      icon: BriefcaseIcon,
    },
    {
      key: "messages" as const,
      href: "/student/messages",
      label: "Messages",
      icon: ChatBubbleLeftRightIcon,
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
            className={
              "student-workspace-nav-link " + (selected ? "active" : "")
            }
            aria-label={item.label}
            aria-current={selected ? "page" : undefined}
          >
            <Icon aria-hidden="true" />
            <span>{item.label}</span>
            {"count" in item && item.count ? (
              <strong
                aria-label={
                  String(item.count) + " Employer Training assignments"
                }
              >
                {item.count}
              </strong>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
