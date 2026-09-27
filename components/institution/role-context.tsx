import { EyeIcon, PencilSquareIcon } from "@heroicons/react/24/outline";

export function InstitutionRoleContext({
  roleLabel,
  scopeLabel,
  canManage,
}: {
  roleLabel: string;
  scopeLabel: string;
  canManage: boolean;
}) {
  const Icon = canManage ? PencilSquareIcon : EyeIcon;
  return (
    <div className="institution-role-context" aria-label="Current Institution role and access">
      <Icon aria-hidden="true" />
      <span>
        <strong>{roleLabel}</strong>
        <small>{scopeLabel} · {canManage ? "Assignment management" : "View only"}</small>
      </span>
    </div>
  );
}
