import { Badge, Button, PageHeader } from "@/components/ui";

export function PlannedSection({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex max-w-xl flex-col gap-4">
      <Badge>Not built yet</Badge>
      <PageHeader title={title} description={description} />
      <div>
        <Button href="/dashboard" variant="secondary" size="sm">
          Back to dashboard
        </Button>
      </div>
    </div>
  );
}
