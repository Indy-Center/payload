import type { CollectionConfig, GlobalConfig, Plugin } from 'payload'

const FORM_GUARD = '/components/admin/LeaveGuard#FormLeaveGuard'

// A document slot, so the guard is inside the form, on a page and in a drawer alike. Collections
// call the slot's group `edit`, globals `elements`.

const guardedCollection = (collection: CollectionConfig): CollectionConfig => {
  const components = collection.admin?.components
  const edit = components?.edit
  return {
    ...collection,
    admin: {
      ...collection.admin,
      components: {
        ...components,
        edit: {
          ...edit,
          beforeDocumentControls: [...(edit?.beforeDocumentControls ?? []), FORM_GUARD],
        },
      },
    },
  }
}

const guardedGlobal = (global: GlobalConfig): GlobalConfig => {
  const components = global.admin?.components
  const elements = components?.elements
  return {
    ...global,
    admin: {
      ...global.admin,
      components: {
        ...components,
        elements: {
          ...elements,
          beforeDocumentControls: [...(elements?.beforeDocumentControls ?? []), FORM_GUARD],
        },
      },
    },
  }
}

/**
 * Puts the leave guard (`FormLeaveGuard`) in every collection's and global's document form, so no
 * screen of the admin is left out, including ones added later.
 */
export const leaveGuard: Plugin = (config) => ({
  ...config,
  collections: config.collections?.map(guardedCollection),
  globals: config.globals?.map(guardedGlobal),
})
