import Link from "next/link";
import { auth } from "@/auth";
import { Badge, EmptyState, PageHeader } from "@/components/ui";
import { createCharacter, listOwnedCharacters } from "./actions";
import { CharacterForm } from "./character-form";

export const dynamic = "force-dynamic";

export default async function CharactersPage() {
  const session = await auth();
  const ownedCharacters = session?.user ? await listOwnedCharacters(session.user.id) : [];

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <PageHeader
        title="Characters"
        description="Reusable characters with locked appearance details. Upload or generate reference images, approve them, then run a cheap consistency test before a full character sheet. Assign a character to a scene to keep visuals consistent and get continuity warnings if a generated image drifts."
      />

      <details className="rounded-xl border border-border bg-surface">
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-foreground">New character</summary>
        <div className="border-t border-border p-4">
          <CharacterForm action={createCharacter} submitLabel="Create character" />
        </div>
      </details>

      {ownedCharacters.length === 0 ? (
        <EmptyState title="No characters yet" description="Create one above to reuse it across projects." />
      ) : (
        <ul className="flex flex-col gap-2">
          {ownedCharacters.map((character) => (
            <li key={character.id}>
              <Link
                href={`/characters/${character.id}`}
                className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface p-4 text-sm transition-colors hover:border-border-strong hover:bg-surface-raised"
              >
                <span className="flex items-center gap-2">
                  <span className="font-medium text-foreground">{character.name}</span>
                  {character.isRealPerson && <Badge>Real person</Badge>}
                </span>
                <span className="max-w-xs truncate text-xs text-muted">{character.description}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
