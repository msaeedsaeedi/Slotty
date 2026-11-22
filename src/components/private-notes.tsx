/** A private note as shown to staff; the service decides who may see which (ADR-031). */
export interface VisibleNote {
  body: string;
  author: string | null;
  mine: boolean;
}

/** Staff-only notes on an evaluation, each with who wrote it. Renders nothing when empty. */
export function PrivateNotes({ notes, skipMine = false }: { notes: VisibleNote[]; skipMine?: boolean }) {
  const shown = skipMine ? notes.filter((n) => !n.mine) : notes;
  if (shown.length === 0) return null;
  return (
    <div className="space-y-1 text-sm text-muted-foreground">
      {shown.map((n, i) => (
        <p key={i}>
          <span className="font-medium">Private note ({n.mine ? "yours" : (n.author ?? "earlier, author unknown")}):</span> {n.body}
        </p>
      ))}
    </div>
  );
}
