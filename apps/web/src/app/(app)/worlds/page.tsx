import Link from "next/link";
import { auth } from "@/auth";
import { listOwnedCharacters } from "../characters/actions";
import { createWorld, listOwnedWorlds } from "./actions";
import { WorldForm } from "./world-form";

export const dynamic = "force-dynamic";

export default async function WorldsPage() {
  const session = await auth();
  const ownedWorlds = session?.user ? await listOwnedWorlds(session.user.id) : [];
  const ownedCharacters = session?.user ? await listOwnedCharacters(session.user.id) : [];

  return (
    <div className="flex max-w-2xl flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold">World Library</h1>
        <p className="mt-1 text-sm text-muted">
          Reusable settings with locked location, lighting, camera, and style details — upload or
          generate reference images, approve them, and assign the characters who appear here. Not
          yet wired into scene/visual generation — that&apos;s a separate integration.
        </p>
      </div>

      <details className="rounded-lg border border-border bg-surface p-4">
        <summary className="cursor-pointer text-sm font-medium">New world</summary>
        <div className="mt-4">
          <WorldForm
            action={createWorld}
            submitLabel="Create world"
            ownedCharacters={ownedCharacters.map((c) => ({ id: c.id, name: c.name }))}
            assignedCharacterIds={[]}
          />
        </div>
      </details>

      {ownedWorlds.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-sm text-muted">No worlds yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {ownedWorlds.map((world) => (
            <li key={world.id}>
              <Link
                href={`/worlds/${world.id}`}
                className="flex items-center justify-between rounded-lg border border-border bg-surface p-4 text-sm hover:bg-surface-raised"
              >
                <span>{world.name}</span>
                <span className="max-w-xs truncate text-xs text-muted">{world.description}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
