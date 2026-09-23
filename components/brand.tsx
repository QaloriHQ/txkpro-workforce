import Image from "next/image";
import Link from "next/link";

export function Brand() {
  return (
    <Link className="brand" href="/" aria-label="TXKPRO Workforce home">
      <span className="brand-logo-wrap" aria-hidden="true">
        <Image
          className="brand-logo brand-logo-light"
          src="/txkpro-logo-light.svg"
          alt=""
          width={786}
          height={192}
          priority
        />
        <Image
          className="brand-logo brand-logo-dark"
          src="/txkpro-logo-dark.svg"
          alt=""
          width={1575}
          height={385}
          priority
        />
      </span>
      <span className="brand-sub">Workforce</span>
    </Link>
  );
}
