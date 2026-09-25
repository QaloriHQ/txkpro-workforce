import Link from "next/link";

export function CourseAuthoringNav({
  microCertId,
  active,
}: {
  microCertId: string;
  active: "overview" | "structure" | "preview";
}) {
  const base = `/employer/learning/${encodeURIComponent(microCertId)}`;
  const items = [
    { key: "overview", label: "Overview", href: base },
    { key: "structure", label: "Structure", href: `${base}/structure` },
    { key: "preview", label: "Preview as student", href: `${base}/preview` },
  ] as const;

  return (
    <nav className="txk-course-tabs" aria-label="Course authoring">
      {items.map((item) => (
        <Link
          key={item.key}
          href={item.href}
          className={active === item.key ? "active" : ""}
          aria-current={active === item.key ? "page" : undefined}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
