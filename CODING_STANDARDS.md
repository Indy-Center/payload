# Coding standards

Read at review. The pre-commit hook and CI already enforce formatting, types and lint (including the `originalDoc` rule in `eslint.config.mjs`), so these are the judgement calls they cannot make.

## Access

- **An update rule checks where the record is going, not only where it is.** A `Where` returned from `access.update` limits which stored records match; it says nothing about the incoming `data`. A rule scoped to "my courses" must also refuse `data` that points the record at another course (see `authoredAccess` in `src/courseware/access.ts`).
- **Courseware is never deleted.** `delete` is `() => false`; records leave use by being retired. A new courseware collection follows the same rule. The one exception is discarding a never-published draft edition with its own lesson plans (0057): `discardDraft` in `src/courseware/edition-actions.ts` makes its own checks and deletes below access, and nothing else may.

## Tests

- **An access test runs as a user, with `overrideAccess: false`.** The Local API skips access by default, so a test without both proves nothing about permissions.
- **Every endpoint and every read helper has a test as a user it refuses.** A suite that only ever signs in as a lead proves the happy path and nothing about who else gets in; the refusal case is the one that guards the data.
- **A refusal test asserts on the refusal's own message.** A `ValidationError`'s top-level message is generic; the messages a person sees are in `error.data.errors`. `.rejects.toThrow()` alone passes on any error, including a crash.
- **Test content is made up.** The repo is public: no real course, rubric wording or VATUSA sheet in a test or fixture.

## Schema changes

A changed collection comes with its regenerated `src/payload-types.ts` and a migration from `npm run payload migrate:create`. Without the migration it works locally and fails on the VPS.

## The README's rules

`README.md`'s Courseware section states rules the code keeps (who may do what, how editions are numbered, what the documents serve). A change that alters one of those rules changes that sentence in the same commit; a README that describes the old behaviour is a defect of the change, not of the README.
