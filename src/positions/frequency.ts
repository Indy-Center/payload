/** 128225000 Hz as "128.225" MHz: at least three decimals, more only where the frequency has them. */
export function megahertz(hertz: number | null | undefined): string {
  if (typeof hertz !== 'number' || !Number.isFinite(hertz)) return ''
  const [whole, fraction = ''] = String(hertz / 1_000_000).split('.')
  return `${whole}.${fraction.padEnd(3, '0')}`
}
