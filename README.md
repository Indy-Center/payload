# payload

The [Payload](https://payloadcms.com) content management system for Indy Center, run in Docker on the Vanderbilt VPS at <https://cms.flyindycenter.com>. Staff edit content in its admin panel; other Indy Center sites read that content over its REST API.

[![Build and Deploy](https://github.com/Indy-Center/payload/actions/workflows/build-and-deploy.yml/badge.svg)](https://github.com/Indy-Center/payload/actions/workflows/build-and-deploy.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

It holds Indy Center's **courseware**: courses, their versions, modules and lesson plans, the shared task tree, scenarios, the USA and GCAP frameworks, references and grading scales. indy-library (`library.flyindycenter.com`) reads it; in a later release training-tools will too. It also holds the **partners** the community site (`flyindycenter.com`) lists, and has `media` for public uploads and `private-media` for files only signed-in users may read. It signs people in with Payload's own email and password accounts, not yet with identity, so courseware is not yet open to course authors (that waits on identity sign-in, DEV-136 and DEV-219).

## HTTP surface

- `GET /admin` — the admin panel. On an empty database it asks whoever opens it to create the first admin account.
- `/api/<collection>` — Payload's REST API for each collection (`users`, `media`, `private-media`, and the courseware collections `frameworks`, `competencies`, `references`, `tasks`, `grading-scales`, `courses`, `course-versions`, `lesson-plans`, `scenarios`, and `partner-categories` and `partners`): `GET` to list, `POST` to create, `GET`, `PATCH` and `DELETE` on `/api/<collection>/<id>`. Courseware refuses `DELETE`. Partners and partner categories are open to partners editors only.
- `GET /api/users/init` — whether the first admin account exists. The deploy calls it to check the app can reach its database.
- `POST /api/users/login`, `POST /api/users/logout`, `GET /api/users/me` — sign in, sign out, and the signed-in user.
- `GET /api/private-media/file/<filename>` — a private file, for signed-in users only.
- `GET /api/media/file/<filename>` — a public upload, when it is stored on local disk. In production public uploads are served from <https://media.flyindycenter.com> instead, not by this app.
- `POST /api/graphql` — the same data over GraphQL. `GET /api/graphql-playground` is a query editor, off in production.
- `GET /api/courseware/courses`, `GET /api/courseware/courses/<code>/current` (or `/draft`), `GET /api/courseware/catalogue` — the reads indy-library makes: the course list, one whole course version, and the task tree with frameworks, competencies and references. They include teacher notes, so they need `Authorization: Bearer <LIBRARY_API_TOKEN>` and answer 401 otherwise. The shapes are in `src/courseware/document.ts`.
- `GET /api/community/partners` — the read the community site makes: the published partners, grouped by partner category, in order. Drafts are left out, as is a published partner that breaks the publishing rule (one published before it, or whose logo was deleted): it needs a logo, a tagline, a description and one to three public calls to action, and so is a category with none left. It needs `Authorization: Bearer <COMMUNITY_API_TOKEN>` and answers 401 otherwise. The shape is in `src/partners/document.ts`. (Not `/api/partners`, which is the partners collection's own REST API.)
- `GET /api/training/resources` — the read training-tools makes: the teacher resources, in the Training Admin's order. It needs `Authorization: Bearer <TRAINING_API_TOKEN>` and answers 401 otherwise. The shape is in `src/training/document.ts`. (`/api/globals/teacher-resources` is the Global's own REST API, open to the Training Admin only.)
- `GET /` — redirects to `/admin`. The CMS has no frontend of its own.

## Project layout

- `src/payload.config.ts`: the Payload config: collections, database, editor.
- `next.config.ts`: the Next.js config, including the redirect from `/` to `/admin`.
- `src/collections/`: one file per collection.
- `src/collections/courseware/`: the courseware collections.
- `src/courseware/`: the rules they share: who may do what (`access.ts`), the task tree and its numbers, expanding a parent task into rows, publishing and the frozen shape, the reads for the library, and the framework import.
- `src/collections/partners/`: the partner categories and partners collections.
- `src/partners/`: who may edit partners (`access.ts`), the rules for their logo, banner and gallery (`images.ts`), their links and member perks (`links.ts`), what publishing needs (`publishing.ts`), and the community site's read and its shape.
- `src/globals/`: one file per Global: Teacher resources.
- `src/training/`: who may edit what training-tools shows (`access.ts`), and training-tools' read and its shape.
- `src/bearer-token.ts`: the check the library's, the community site's and training-tools' reads share.
- `scripts/import-frameworks.ts`: loads the USA and GCAP frameworks and the rubrics; see Courseware.
- `src/storage.ts`: where uploads are stored: the two R2 buckets, or local disk when they aren't configured.
- `src/migrations/`: database migrations, created by `npm run payload migrate:create`. In production the app applies new ones on its first request after a deploy.
- `src/payload-types.ts`: types generated from the config by `npm run generate:types`.
- `src/app/(payload)/`: the admin panel and API routes, generated by Payload. Edited by hand only in `custom.scss` and `_styles/` (the admin's look), and where `admin/[[...segments]]/page.tsx` and `not-found.tsx` pass their metadata through `withBranding`.
- `src/branding.ts`: presents the admin as an Indy Center app: the tab title, favicon, logo, sidebar additions and wording that would otherwise name Payload.
- `src/components/admin/`: the admin's custom components: the logo and shield, the Indy Center links and the sidebar footer that `branding.ts` adds, and the teacher resources' row label. After adding one, run `npm run generate:importmap` and commit `src/app/(payload)/admin/importMap.js`.
- `public/`: the favicons, served from the site root.
- `tests/int/`: tests that run against a real database.
- `Dockerfile`: builds the image the VPS runs.
- `deploy/`: everything deployed to `/home/deploy/apps/payload/` on the VPS, and nothing else.
  - `docker-compose.yml`: the app, its Postgres database, their volumes and the Traefik labels.
  - `.env.example`: the runtime settings the deploy writes to `.env`.
- `.github/workflows/ci.yml`: two jobs side by side. One runs format, lint, types and tests; the other checks the compose file, builds the image and starts the whole stack on the runner. This goes against [CI shape](https://tech.flyindycenter.com/patterns/ci-shape/), which runs the compose check after the project's own checks: the page was written before a stack like this one, whose image builds from source without anything the checks produce. Side by side, a typo still fails the pull request, only sooner.
- `.github/workflows/build-and-deploy.yml`: runs CI, pushes the image to `ghcr.io/indy-center/payload`, then rsyncs `deploy/` to the VPS and runs `docker compose up -d` over SSH.

## Courseware

Written in the admin panel's stock screens, shaped by rules that run on save. The decisions behind them are in the maintainer's courseware notes.

- **Nothing is deleted.** Tasks and scenarios are retired instead; retired records stay where they are used, are left out of pickers, and are hidden from lists unless the list is filtered on Retired.
- **The task tree.** A task's number (2.3.1) comes from its parent and its place among its siblings, and is never stored. Order siblings by dragging in the Tasks list sorted by its order. A mapping on a task applies to every task beneath it. A competency with no text (a heading) cannot be mapped to.
- **Parent tasks expand.** Adding a task that has tasks beneath it to a lesson plan's theory items or a scenario's practical tasks adds a row for each of them when the record is saved, once; rows can then be removed or reordered, and later additions to the tree change nothing.
- **Publishing.** A Training Admin or lead sets a course version's Status to Published and saves. The version must name a grading scale, and every lesson plan in its modules needs a code, a title, a minimum and at least one theory item or scenario, with nothing retired; otherwise the save is refused with every fault listed. A published version becomes the course's current version; the one before stays as data. Its shape (modules, lesson plans and their order, theory items, scenarios offered, minimums, scale) is then frozen, and a scale it uses cannot gain, lose or reorder points; wording still saves.
- **Who may do what.** Accounts carry a CID and roles, set only by the Training Admin or the CMS admin. `cms:admin` may do everything in the CMS: courseware, partners, teacher resources and accounts. `training:admin` and `training:lead` do everything in courseware, including managing accounts. A course author (their CID named on a course) edits that course's drafts, lesson plans and scenarios only. While no account holds `training:admin` or `cms:admin`, any signed-in account may set roles, so the first can be given it.

**Importing the frameworks.** VATUSA's competency sheet, saved as CSV (`usa-framework.csv`, `gcap-codes.csv`, `rubric-s1.csv`, `-s2`, `-s3`, `-c1`), is loaded from the engineer's machine:

```bash
CMS_URL=https://cms.flyindycenter.com CMS_EMAIL=… CMS_PASSWORD=… \
  npm run import:frameworks -- --sheets ~/vatusa-sheet --usa-edition 2026-10 --gcap-edition 2026-10
```

Keep the sheets outside this repository, which is public; a folder inside it is refused. Records are matched by framework edition and source id, so running it again changes nothing that is already right; it reports what it created, changed and left alone. It fixes the sheet's known faults and leaves out the "meets all established standards" rows.

**No courseware in this repository.** It is public: tests use made-up content only, and real courseware, rubric wording and import sheets are never committed.

## Partners

The people and groups Indy Center works with, listed on the community site's partners page. The decisions behind them are in the maintainer's community-website notes.

- **Who may edit them.** Accounts with `partners:editor`, which the Training Admin or the CMS admin gives, and the CMS admin. Nobody else can see or change partners or partner categories, through the admin or the API.
- **Publishing.** A partner starts as a draft, which may be incomplete. Setting its Status to Published puts it on the site within a few minutes. It is refused until the partner has a logo, a tagline, a description and one to three calls to action that aren't member perks, and the refusal names everything missing. Setting it back to Draft takes it off and keeps its details.
- **Calls to action and member perks.** A call to action is a label and a web address. One marked as a member perk also says what members get, and the site shows it only to people signed in; perks don't count towards the three. Social links pair a platform from a fixed list with a web address.
- **Partner categories.** One that still has partners, drafts included, can't be deleted.
- **Slugs.** A partner's slug is its address on the site, `/partners/<slug>`. Left empty, it is filled from the name; it can be changed, and no two partners share one.
- **Images.** A partner's logo (SVG, PNG or WebP), banner (optional, at least 1600×500) and gallery (optional) are uploads to `media`, so they are public as soon as they are uploaded. Payload makes the sizes the site shows: a 256px logo, a 2400px-wide banner, and a 400px thumbnail and 1600px large copy of each photo. It can't make sizes for partner images only, so every image in `media` gets them; SVGs, and images already smaller than a size, are served as uploaded.

## Teacher resources

The links every teacher sees on training-tools' `/teach` page, kept by the Training Admin (or the CMS admin) under **Training → Teacher resources**. Nobody else can see or change them, through the admin or the API. Each row is a title, an optional plain-text description, an `https` address, whether it opens in a new tab (on unless unticked), and an icon from a fixed list (the link icon unless chosen). The list is fixed because training-tools builds each icon in; adding one is a change in both repos. Rows show in the order they are listed; a removed row is gone. A save is live; training-tools' README says how soon `/teach` shows it. The decision behind it is in the maintainer's training-app notes (0036).

**To set the token**, generate one value (`openssl rand -hex 32`) and set it in both places: as the repo secret `ENV_TRAINING_API_TOKEN` here, then re-run the deploy, and on training-tools with `npx wrangler secret put TRAINING_API_TOKEN`. Either may go first; until both match, training-tools does not show the panel.

## The admin's look

The admin is Payload's own, rethemed to sit beside the other Indy Center apps: their Tailwind gray, slate and sky colours, sky buttons and links, rounded corners, the Indy Center logo, and a sidebar with links to the other apps and their footer. The decisions behind it are in the maintainer's notes on the CMS.

- **Light first, dark as a choice.** Each person picks Automatic, Light or Dark under Settings on their account page. Automatic follows the system theme; with no signal it is light. Before sign-in, the login screen follows a dark system theme only in Chromium browsers, which send it with the request; others show light.
- **Where the styles live.** `src/app/(payload)/custom.scss` lists the partials in `src/app/(payload)/_styles/`: `_palette` (the Tailwind colours, as `--tw-*` properties), `_base` (font, corners, status colours and small fixes for both themes), `_light`, `_dark`, and `_nav` (the sidebar). They set Payload's own theme variables and override its stock rules, which sit in a lower CSS layer, so no `!important` is needed.

## Data

The Postgres database lives in the `payload_db-data` Docker volume on the VPS, named after the repository. It is not backed up yet. Renaming the repository starts the app on a new, empty volume.

Every record's id is a version 7 UUID, not a counter, so an id stored by another system (training-tools, Jira) means the same record in every copy of the database.

Uploads live in two Cloudflare R2 buckets:

| Collection      | Bucket            | Who can read a file                                                         |
| --------------- | ----------------- | --------------------------------------------------------------------------- |
| `media`         | `payload-media`   | Anyone with its URL. Served by Cloudflare from `media.flyindycenter.com`.   |
| `private-media` | `payload-private` | Signed-in users. The bucket has no public access; this app serves the file. |

Don't put anything in `media` that shouldn't be public, including images for pages that aren't published yet. Files over 10 MB are refused.

A bucket is used once all of its `R2_*` settings are present (`deploy/.env.example`). Without them that collection's uploads go to the `payload_media` or `payload_private-media` volume instead, which is what CI and local development do. Files aren't moved when a bucket is switched on or off: uploads made before the switch stop resolving.

## Local development

Needs Node 22 and Docker.

```bash
npm install
cp .env.example .env   # then set PAYLOAD_SECRET to any long random string

# A local database matching the DATABASE_URL in .env.example
docker run --name payload-db -d -p 5432:5432 \
  -e POSTGRES_USER=payload -e POSTGRES_PASSWORD=payload -e POSTGRES_DB=payload \
  postgres:17-alpine

npm run dev            # http://localhost:3000/admin
```

In development Payload changes the database to match the config as you edit it. Production only changes through migrations, so after changing a collection:

```bash
npm run generate:types
npm run payload migrate:create
```

and commit what both write. A collection change without a migration works locally and fails on the VPS.

## Tests

```bash
npm run format:check
npm run lint
npm run typecheck
npm test               # needs the local database
```

## Deployment

`build-and-deploy.yml` runs on every push to `main`, and by hand from **Actions → Build and Deploy → Run workflow**. It calls `ci.yml` first and only deploys if it passes, checks the containers are still up 15 seconds later, then requests `/api/users/init` through Traefik. [Deploying to the VPS](https://tech.flyindycenter.com/patterns/vps-apps/) describes the pipeline.

Before the first deploy:

1. An org admin adds this repository to the organization's `VANDERBILT_*` variables and secrets (all four).
2. Set the repository's `ENV_*` secrets and variables; `deploy/.env.example` describes each one. Keep the source copies in 1Password.
3. If the VPS can't pull the image, GHCR created the package private. Make `ghcr.io/indy-center/payload` public in the package's settings and re-run the workflow.
4. Open <https://cms.flyindycenter.com/admin> straight away and create the first admin account. Until someone does, anyone who finds the address can.

`ENV_POSTGRES_PASSWORD` is only read when the database volume is first created. Changing the secret afterwards doesn't change the database's password, and the app can no longer connect.

## Disclaimer

We are not affiliated with the FAA or any aviation governing body. This software is for flight simulation use on the [VATSIM](https://www.vatsim.net) network.
