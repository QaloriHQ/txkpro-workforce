import Link from "next/link";
import { ClockIcon } from "@heroicons/react/24/outline";
export function StudentComingSoon({ title, description }: { title: string; description: string }) {
  return <section className="card student-coming-soon"><span className="student-training-icon"><ClockIcon aria-hidden="true" /></span><span className="pill pill-info">Coming soon</span><h2>{title}</h2><p className="card-sub">{description}</p><Link className="button" href="/student">Back to Home</Link></section>;
}
