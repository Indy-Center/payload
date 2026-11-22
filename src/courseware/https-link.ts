/**
 * Whether a courseware link is acceptable: it starts with `https://`. A source's link and a
 * citation's own link are both held to this (decisions 0053, 0072).
 */
export const isHttpsLink = (value: string): boolean => value.startsWith('https://')
