import { ValidationError, type Payload } from 'payload'
import sharp from 'sharp'
import type { Media } from '@/payload-types'

/** The messages a person sees when a save is refused as invalid. */
export async function invalid(promise: Promise<unknown>): Promise<string[]> {
  try {
    await promise
  } catch (error) {
    if (error instanceof ValidationError) return error.data.errors.map((entry) => entry.message)
    throw error
  }
  throw new Error('Expected the save to be refused')
}

/** A made-up file, as an upload hands it to Payload. */
export type TestFile = { data: Buffer; mimetype: string; name: string; size: number }

export function file(name: string, mimetype: string, data: Buffer): TestFile {
  return { data, mimetype, name, size: data.length }
}

/** A plain image of the given size, drawn on the spot. */
export async function image(
  width: number,
  height: number,
  format: 'png' | 'jpeg' | 'webp' = 'png',
): Promise<TestFile> {
  const data = await sharp({
    create: { width, height, channels: 3, background: { r: 14, g: 165, b: 233 } },
  })
    .toFormat(format)
    .toBuffer()
  return file(`example.${format}`, `image/${format}`, data)
}

/** A 300×300 SVG mark. */
export function svg(): TestFile {
  return file(
    'example.svg',
    'image/svg+xml',
    Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><rect width="300" height="300" fill="#0ea5e9"/></svg>',
    ),
  )
}

/**
 * Deletes every media record through Payload, which removes its files too. Emptying the tables
 * alone would leave them in the local media folder.
 */
export async function removeUploads(payload: Payload): Promise<void> {
  await payload.delete({ collection: 'media', where: { id: { exists: true } } })
}

export async function upload(
  payload: Payload,
  file: TestFile,
  alt = 'An example image',
): Promise<Media> {
  return payload.create({ collection: 'media', data: { alt }, file })
}
