import Link from "next/link";
import { auth } from "@/auth";
import { EmptyState, PageHeader } from "@/components/ui";
import { listOwnedCharacters } from "../characters/actions";
import { createWorld, listOwnedWorlds } from "./actions";
import { WorldForm } from "./world-form";

export const dynamic = "force-dynamic";

export default async function WorldsPage() {
  const session = await auth();
  const [ownedWorlds, ownedCharacters] = session?.user
    ? await Promise.all([listOwnedWorlds(session.user.id), listOwnedCharacters(session.user.id)])
    : [[], []];

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <PageHeader
        title="Worlds"
        description="Reusable settings with locked location, lighting, camera, and style details. Upload or generate reference images, approve them, and assign the characters who appear here. Assign a world to a scene to keep visuals consistent and get continuity warnings if a generated image drifts."
      />

      <details className="rounded-xl border border-border bg-surface">
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-foreground">New world</summary>
        <div className="border-t border-border p-4">
          <WorldForm
            action={createWorld}
            submitLabel="Create world"
            ownedCharacters={ownedCharacters.map((c) => ({ id: c.id, name: c.name }))}
            assignedCharacterIds={[]}
          />
        </div>
      </details>

      {ownedWorlds.length === 0 ? (
        <EmptyState title="No worlds yet" description="Create one above to reuse it across projects." />
      ) : (
        <ul className="flex flex-col gap-2">
          {ownedWorlds.map((world) => (
            <li key={world.id}>
              <Link
                href={`/worlds/${world.id}`}
                className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface p-4 text-sm transition-colors hover:border-border-strong hover:bg-surface-raised"
              >
                <span className="font-medium text-foreground">{world.name}</span>
                <span className="max-w-xs truncate text-xs text-muted">{world.description}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
