import { createLocalReq, type Payload } from 'payload'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { loadCredentialList } from '@/courseware/credential-list'
import type { User } from '@/payload-types'
import { resetDatabase, testPayload } from './helpers'

let payload: Payload
let author: User

beforeAll(async () => {
  payload = await testPayload()
})

beforeEach(async () => {
  await resetDatabase(payload)
  author = await payload.create({
    collection: 'users',
    data: { email: 'author@example.com', password: 'example-password', cid: '1000001' },
  })
})

/** The Credentials tab as a signed-in course author sees it. */
async function list(showRetired = false) {
  const req = await createLocalReq({ user: { ...author, collection: 'users' } }, payload)
  return loadCredentialList(req, { showRetired })
}

/** Made-up credentials: two certifications, an endorsement, and a retired endorsement. */
async function seed() {
  const credential = (data: Record<string, unknown>) =>
    payload.create({ collection: 'credentials', data: data as never })
  const ground = await credential({
    code: 'X-GC',
    kind: 'certification',
    name: 'Example Ground',
    rank: 2,
    grantedOnArrival: ['S1'],
  })
  await credential({ code: 'X-DEL', kind: 'certification', name: 'Example Delivery', rank: 1 })
  const local = await credential({ code: 'X-LC', kind: 'endorsement', name: 'Example Local' })
  await credential({ code: 'X-OLD', kind: 'endorsement', name: 'Example Old', retired: true })
  const tower = await payload.create({
    collection: 'courses',
    data: { code: 'X-TWR', title: 'Example Tower', credentialIssued: local.id },
  })
  return { ground, local, tower }
}

describe('the Credentials tab', () => {
  it('lists certifications up the ladder, then endorsements, with who issues each', async () => {
    const { tower } = await seed()

    expect(await list()).toEqual([
      expect.objectContaining({ code: 'X-DEL', rank: 1, issuedBy: null }),
      expect.objectContaining({
        code: 'X-GC',
        kind: 'certification',
        name: 'Example Ground',
        rank: 2,
        grantedOnArrival: ['S1'],
        retired: false,
        issuedBy: null,
      }),
      expect.objectContaining({
        code: 'X-LC',
        kind: 'endorsement',
        rank: null,
        grantedOnArrival: [],
        issuedBy: { id: tower.id, code: 'X-TWR' },
      }),
    ])
  })

  it('follows the course that names a credential, not anything stored on it', async () => {
    const { ground, tower } = await seed()
    await payload.update({
      collection: 'courses',
      id: tower.id,
      data: { credentialIssued: ground.id },
    })

    const rows = await list()

    expect(rows.find((row) => row.code === 'X-GC')?.issuedBy).toEqual({
      id: tower.id,
      code: 'X-TWR',
    })
    expect(rows.find((row) => row.code === 'X-LC')?.issuedBy).toBeNull()
  })

  it('hides retired credentials unless asked for', async () => {
    await seed()

    expect((await list()).map((row) => row.code)).not.toContain('X-OLD')
    expect(await list(true)).toContainEqual(
      expect.objectContaining({ code: 'X-OLD', retired: true }),
    )
  })

  it('is read as the person signed in, so no one signed out sees the list', async () => {
    await seed()
    const signedOut = await createLocalReq({}, payload)

    await expect(loadCredentialList(signedOut, { showRetired: false })).rejects.toThrow(
      'You are not allowed',
    )
  })
})
