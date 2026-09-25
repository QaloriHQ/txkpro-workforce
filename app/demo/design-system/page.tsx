import {
  CheckCircleIcon,
  PlusIcon,
} from "@heroicons/react/24/outline";
import { Brand } from "@/components/brand";
import {
  Button,
  ButtonLink,
  Card,
  EmptyState,
  FormField,
  IconButton,
  Input,
  MetricCard,
  PageHeader,
  RoleViewBanner,
  StateIcon,
  StatusBadge,
  Textarea,
} from "@/components/design-system";
import { ThemeToggle } from "@/components/theme-toggle";

export default function DesignSystemReferencePage() {
  return (
    <>
      <header className="topbar">
        <Brand />
        <div className="header-actions">
          <ThemeToggle />
        </div>
      </header>
      <main className="page-wrap txk-prototype-content">
        <PageHeader
          eyebrow="TXKPRO UI"
          title="Prototype-parity component system"
          description="Shared visual language from the Student, Institution and Employer prototypes, with role-specific shell behavior preserved."
        />

        <RoleViewBanner title="Visual source rule">
          Components should reproduce the prototype language rather than introduce
          generic library defaults.
        </RoleViewBanner>

        <section className="txk-reference-section">
          <h2>Actions</h2>
          <div className="txk-reference-row">
            <Button tone="primary">
              <PlusIcon aria-hidden="true" />
              Primary action
            </Button>
            <Button>Secondary action</Button>
            <Button tone="ghost">Ghost action</Button>
            <Button tone="danger">Destructive action</Button>
            <IconButton label="Confirm">
              <CheckCircleIcon aria-hidden="true" />
            </IconButton>
          </div>
        </section>

        <section className="txk-reference-section">
          <h2>Status & trust</h2>
          <div className="txk-reference-row">
            <StatusBadge>Draft</StatusBadge>
            <StatusBadge tone="info">Ready</StatusBadge>
            <StatusBadge tone="success">Verified</StatusBadge>
            <StatusBadge tone="warning">Review</StatusBadge>
            <StatusBadge tone="danger">Revoked</StatusBadge>
            <StateIcon state="success" label="Complete" />
            <StateIcon state="danger" label="Needs attention" />
          </div>
        </section>

        <section className="txk-metric-grid">
          <MetricCard label="Students" value="128" detail="Illustrative reference" />
          <MetricCard label="Verified skills" value="412" detail="Illustrative reference" />
          <MetricCard label="Referrals" value="24" detail="Illustrative reference" />
          <MetricCard label="Placements" value="8" detail="Illustrative reference" />
        </section>

        <section className="txk-reference-grid">
          <Card>
            <h2>Form controls</h2>
            <div className="txk-form-stack">
              <FormField label="Course title" help="Use a clear company-specific training title.">
                <Input defaultValue="Residential Service Readiness" />
              </FormField>
              <FormField label="Learning objective">
                <Textarea defaultValue="Prepare learners for the company-specific field process." />
              </FormField>
            </div>
          </Card>

          <Card>
            <h2>Empty state</h2>
            <EmptyState
              title="Nothing to review"
              description="When work arrives, it will appear here with a clear next action."
              action={<ButtonLink href="/demo/design-system">Refresh reference</ButtonLink>}
            />
          </Card>
        </section>
      </main>
    </>
  );
}
