/** The group's codebook. A placeholder until the editor lands. */
export function CodebookPage({ groupId }: { groupId: number }) {
  return (
    <div className="max-w-5xl w-full mx-auto px-6! py-8! flex-1" data-group-id={groupId}>
      <h2 className="text-lg font-semibold text-[var(--text)]">Codebook</h2>
      <p className="mt-2! text-sm text-[var(--text-secondary)]">The codebook editor arrives in the next step.</p>
    </div>
  );
}
