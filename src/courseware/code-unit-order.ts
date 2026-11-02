/**
 * Orders strings by UTF-16 code unit, so an order doesn't hang on the database's collation or the
 * server's locale.
 */
export function compareCodeUnits(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}
