import Link from "next/link";
import { auth } from "@/auth";
import { createCharacter, listOwnedCharacters } from "./actions";
import { CharacterForm } from "./character-form";

export const dynamic = "force-dynamic";

export default async function CharactersPage() {
  const session = await auth();
  const ownedCharacters = session?.user ? await listOwnedCharacters(session.user.id) : [];

  return (
    <div className="flex max-w-2xl flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold">Character Library</h1>
        <p className="mt-1 text-sm text-muted">
          Reusable characters with locked appearance details — upload or generate reference images,
          approve them, then run a cheap consistency test before a full character sheet. Assign a
          character to a scene on its project page to keep visuals consistent and get continuity
          warnings if a generated image drifts from the locked details.
        </p>
      </div>

      <details className="rounded-lg border border-border bg-surface p-4">
        <summary className="cursor-pointer text-sm font-medium">New character</summary>
        <div className="mt-4">
          <CharacterForm action={createCharacter} submitLabel="Create character" />
        </div>
      </details>

      {ownedCharacters.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-sm text-muted">
          No characters yet.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {ownedCharacters.map((character) => (
            <li key={character.id}>
              <Link
                href={`/characters/${character.id}`}
                className="flex items-center justify-between rounded-lg border border-border bg-surface p-4 text-sm hover:bg-surface-raised"
              >
                <span>
                  {character.name}
                  {character.isRealPerson && (
                    <span className="ml-2 rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted">
                      Real person
                    </span>
                  )}
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
