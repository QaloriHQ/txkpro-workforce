import Link from "next/link";
import { Brand } from "@/components/brand";

export function MarketingFooter() {
  return (
    <footer className="marketing-footer">
      <div className="marketing-footer-inner">
        <div className="marketing-footer-brand">
          <Brand />
          <p>
            A Greater Texarkana workforce platform connecting technical
            programs, verified student capabilities, and vetted skilled-trade
            employers.
          </p>
        </div>
        <nav aria-label="Footer navigation">
          <Link href="/institutions">Institutions</Link>
          <Link href="/employers">Employers</Link>
          <Link href="/students">Students</Link>
          <Link href="/platform">Platform</Link>
          <Link href="/credentials">Verify credential</Link>
          <Link href="/login">Sign in</Link>
        </nav>
      </div>
    </footer>
  );
}
