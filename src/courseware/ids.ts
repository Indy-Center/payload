/** The id of a relationship, whether it came back populated or not. */
export function idOf(value: string | { id: string } | null | undefined): string | null {
  if (!value) return null
  return typeof value === 'string' ? value : value.id
}
