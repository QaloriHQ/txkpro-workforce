import { EyeIcon, PencilSquareIcon } from "@heroicons/react/24/outline";
import {
  institutionAccessLabel,
  type InstitutionAccessLevel,
} from "@/lib/institution/policy";

export function InstitutionRoleContext({
  roleLabel,
  scopeLabel,
  accessLevel,
  capabilityCount,
  managementCapabilityCount,
}: {
  roleLabel: string;
  scopeLabel: string;
  accessLevel: InstitutionAccessLevel;
  capabilityCount?: number;
  managementCapabilityCount?: number;
}) {
  const canAct = !["read", "none"].includes(accessLevel);
  const Icon = canAct ? PencilSquareIcon : EyeIcon;
  return (
    <div className="institution-role-context" aria-label="Current Institution role and access">
      <Icon aria-hidden="true" />
      <span>
        <strong>{roleLabel}</strong>
        <small>
          {scopeLabel} · {institutionAccessLabel(accessLevel)}
          {typeof capabilityCount === "number"
            ? ` · ${capabilityCount} views`
            : ""}
          {typeof managementCapabilityCount === "number"
            ? ` · ${managementCapabilityCount} action scopes`
            : ""}
        </small>
      </span>
    </div>
  );
}
