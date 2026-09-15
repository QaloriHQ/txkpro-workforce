import Link from "next/link";

export function Brand() {
  return (
    <Link className="brand" href="/">
      <span className="brand-mark">TXK</span>
      <span className="brand-word">PRO</span>
      <span className="brand-sub">Workforce</span>
    </Link>
  );
}
