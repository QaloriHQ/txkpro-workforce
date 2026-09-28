import { EyeIcon, PencilSquareIcon } from "@heroicons/react/24/outline";
import {
  institutionAccessLabel,
  type InstitutionAccessLevel,
} from "@/lib/institution/policy";

export function InstitutionRoleContext({
  roleLabel,
  scopeLabel,
  accessLevel,
}: {
  roleLabel: string;
  scopeLabel: string;
  accessLevel: InstitutionAccessLevel;
}) {
  const canAct = !["read", "none"].includes(accessLevel);
  const Icon = canAct ? PencilSquareIcon : EyeIcon;
  return (
    <div className="institution-role-context" aria-label="Current Institution role and access">
      <Icon aria-hidden="true" />
      <span>
        <strong>{roleLabel}</strong>
        <small>{scopeLabel} · {institutionAccessLabel(accessLevel)}</small>
      </span>
    </div>
  );
}
