/** "edition 3 (draft)": the edition the Scenarios tab and a scenario's form read. */
export const editionLabel = (edition: { number: number; status: 'draft' | 'live' }) =>
  `edition ${edition.number} (${edition.status})`
