/**
 * What the CMS serves to the community site: the contract. The site keeps a hand-copied type of
 * it that names this file as its source.
 *
 * `GET /api/community/partners`, with the site's server credential in `COMMUNITY_API_TOKEN` as a
 * bearer token, returns the published partners grouped by category. Drafts are never included,
 * and neither is a category with no published partners.
 */

export type PartnersDocument = {
  /** Lowest order first, each holding at least one partner. */
  categories: Category[]
}

export type Category = {
  id: string
  name: string
  blurb: string
  /** Lowest order first; equal orders go by name. */
  partners: Partner[]
}

export type Partner = {
  slug: string
  name: string
  tagline: string
  /** Plain text, paragraphs separated by blank lines. */
  description: string
}
