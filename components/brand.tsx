import Image from "next/image";
import Link from "next/link";

export function Brand() {
  return (
    <Link className="brand" href="/" aria-label="TXKPRO Workforce home">
      <span className="brand-logo-wrap" aria-hidden="true">
        <Image
          className="brand-logo brand-logo-light"
          src="/brand/txkpro-logo-light.png"
          alt=""
          width={700}
          height={174}
          priority
        />
        <Image
          className="brand-logo brand-logo-dark"
          src="/brand/txkpro-logo-dark.png"
          alt=""
          width={700}
          height={171}
          priority
        />
      </span>
      <span className="brand-sub">Workforce</span>
    </Link>
  );
}
