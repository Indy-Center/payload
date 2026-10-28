# payload

The [Payload](https://payloadcms.com) content management system for Indy Center, run in Docker on the Vanderbilt VPS at <https://cms.flyindycenter.com>. Staff edit content in its admin panel; other Indy Center sites read that content over its REST API.

[![Build and Deploy](https://github.com/Indy-Center/payload/actions/workflows/build-and-deploy.yml/badge.svg)](https://github.com/Indy-Center/payload/actions/workflows/build-and-deploy.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

It holds Indy Center's **courseware**: courses, their versions, modules and lesson plans, the shared task tree, scenarios, the USA and GCAP frameworks, sources (the outside documents tasks cite, each at an https link), grading scales and the credentials (certifications and endorsements) Indy issues. indy-library (`library.flyindycenter.com`) reads it; in a later release training-tools will too. It also holds the **partners** the community site (`flyindycenter.com`) lists, and has `media` for public uploads and `private-media` for files only signed-in users may read. It signs people in with Payload's own email and password accounts, not yet with identity, so courseware is not yet open to course authors (that waits on identity sign-in, DEV-136 and DEV-219).

## HTTP surface

- `GET /admin` — the admin panel. On an empty database it asks whoever opens it to create the first admin account.
- `/api/<collection>` — Payload's REST API for each collection (`users`, `media`, `private-media`, and the courseware collections `frameworks`, `competencies`, `sources`, `credentials`, `tasks`, `grading-scales`, `courses`, `course-versions`, `lesson-plans`, `scenarios`, and `partner-categories` and `partners`): `GET` to list, `POST` to create, `GET`, `PATCH` and `DELETE` on `/api/<collection>/<id>`. Courseware refuses `DELETE`. Partners and partner categories are open to partners editors only.
- `GET /api/users/init` — whether the first admin account exists. The deploy calls it to check the app can reach its database.
- `POST /api/users/login`, `POST /api/users/logout`, `GET /api/users/me` — sign in, sign out, and the signed-in user.
- `GET /api/private-media/file/<filename>` — a private file, for signed-in users only.
- `GET /api/media/file/<filename>` — a public upload, when it is stored on local disk. In production public uploads are served from <https://media.flyindycenter.com> instead, not by this app.
- `POST /api/graphql` — the same data over GraphQL. `GET /api/graphql-playground` is a query editor, off in production.
- `GET /api/courseware/courses`, `GET /api/courseware/courses/<code>/current` (or `/draft`), `GET /api/courseware/catalogue` — the reads indy-library makes: the course list, one whole course version, and the task tree with frameworks, competencies and sources, and the credentials. They include teacher notes, so they need `Authorization: Bearer <LIBRARY_API_TOKEN>` and answer 401 otherwise. training-tools reads course versions too, so the course-version read also accepts `<TRAINING_API_TOKEN>`, for `/current` only; the course list and catalogue do not. The shapes are in `src/courseware/document.ts`.
- `GET /api/courseware/competency-tree?edition=<framework id>&search=<text>` — the admin's Competencies list: the framework editions, and one edition's competencies as a tree, with the rows a search matches and the rows above them. For signed-in CMS accounts; it answers 401 otherwise. The shape is in `src/courseware/competency-tree.ts`.
- `POST /api/courseware/courses/<id>/editions`, `GET /api/courseware/course-versions/<id>/publishing-check`, `POST /api/courseware/course-versions/<id>/publish`, `POST /api/courseware/course-versions/<id>/discard` — the course page's actions (see Courseware), for a signed-in account: start a course's next edition, list what stops a draft being published, publish it, and discard it. A refusal answers `{ errors: [{ message }] }`, 400 or 403.
- `GET /api/community/partners` — the read the community site makes: the published partners, grouped by partner category, in order. Drafts are left out, as is a published partner that breaks the publishing rule (one published before it, or whose logo was deleted): it needs a logo, a tagline, a description and one to three public calls to action, and so is a category with none left. It needs `Authorization: Bearer <COMMUNITY_API_TOKEN>` and answers 401 otherwise. The shape is in `src/partners/document.ts`. (Not `/api/partners`, which is the partners collection's own REST API.)
- `GET /api/training/resources` — the read training-tools makes: the teacher resources, in the Training Admin's order. It needs `Authorization: Bearer <TRAINING_API_TOKEN>` and answers 401 otherwise. The shape is in `src/training/document.ts`. (`/api/globals/teacher-resources` is the Global's own REST API, open to the Training Admin only.)
- `GET /` — redirects to `/admin`. The CMS has no frontend of its own.

## Project layout

- `src/payload.config.ts`: the Payload config: collections, database, editor.
- `next.config.ts`: the Next.js config, including the redirect from `/` to `/admin`.
- `src/collections/`: one file per collection.
- `src/collections/courseware/`: the courseware collections.
- `src/courseware/`: the rules they share: who may do what (`access.ts`), the task tree and its numbers, expanding a parent task into rows, publishing and the scale lock, the course page's actions on editions (`edition-actions.ts`), what a course author may not change in a published version (`structure.ts`), the reads for the library and training-tools, and the framework import.
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
- `src/components/admin/`: the admin's custom components: the logo and shield, the Indy Center links and the sidebar footer that `branding.ts` adds, the teacher resources' row label, the Tasks list's tree (`TaskTreeListView`, which reads it, `TaskTreeList` and the reusable `TaskTreeTable`), the Competencies list with its tree and a competency's read-only page (`CompetencyPage`, the Children and Taught by lists, with `NoSaveButton` in place of Save), and the course page's Content and History tabs and Courses list cells (`courses/`). After adding one, run `npm run generate:importmap` and commit `src/app/(payload)/admin/importMap.js`.
- `public/`: the favicons, served from the site root.
- `tests/int/`: tests that run against a real database.
- `tests/backup/round-trip.sh`: backs up, wipes and restores the running stack, and checks the content came back. CI runs it; it throws the stack's data away, so never on the VPS.
- `Dockerfile`: builds the image the VPS runs.
- `deploy/`: everything deployed to `/home/deploy/apps/payload/` on the VPS, and nothing else.
  - `docker-compose.yml`: the app, its Postgres database, their volumes and the Traefik labels.
  - `.env.example`: the runtime settings the deploy writes to `.env`.
  - `backup.sh` and `restore.sh`: the backup recipe the backup runner runs, and its reverse (see [Backups](#backups)).
- `.github/workflows/ci.yml`: two jobs side by side. One runs format, lint, types and tests; the other checks the compose file, builds the image, starts the whole stack on the runner, and runs the backup round trip. This goes against [CI shape](https://tech.flyindycenter.com/patterns/ci-shape/), which runs the compose check after the project's own checks: the page was written before a stack like this one, whose image builds from source without anything the checks produce. Side by side, a typo still fails the pull request, only sooner.
- `.github/workflows/build-and-deploy.yml`: runs CI, pushes the image to `ghcr.io/indy-center/payload`, then rsyncs `deploy/` to the VPS and runs `docker compose up -d` over SSH.

## Courseware

Written in the admin panel's stock screens, shaped by rules that run on save. The decisions behind them are in the maintainer's courseware notes.

- **Nothing is deleted.** Tasks, scenarios and credentials are retired instead; retired records stay where they are used, are left out of pickers, and are hidden from lists unless the list is filtered on Retired (on Tasks, unless "Show retired" is ticked). The one exception is discarding a draft edition, which was never published, with its own lesson plans (0057).
- **The task tree.** A task's number (2.3.1) comes from its parent and its place among its siblings, and is never stored. The Tasks list shows the tree as it is numbered: top-level tasks open to show their children, "Expand all" opens every one, and a search by name shows each match under its parents. A retired task keeps its number, so hiding it leaves a gap (2.2.4, then 2.2.6), and hides the tasks beneath it too. The list does not reorder siblings yet. A mapping on a task applies to every task beneath it. A competency with no text (a heading) cannot be mapped to.
- **Competencies and framework editions.** The Competencies list has a tab for each framework edition (USA first, then GCAP, newest edition first within each), showing its competencies as a tree in the sheet's order. Editions come from the import and are not in the nav: they can't be edited or deleted from the admin, because the import finds an edition by its name and edition, and a renamed one would be imported again beside itself. A wrong edition is fixed by importing under the right name. A competency's page is read-only for everyone, because competencies are edited only by the import (the next import would overwrite a hand edit): it shows the competency as its edition words it, a Children grid of the competencies directly beneath it, and a Taught by list of the live tasks mapped to it, numbered as they are today.
- **The course page.** Courses are worked on from one nav entry, Courses, whose list shows each course's live and draft editions. A course's page has three tabs: **Details** (the course's own fields), **Content** (one edition at a time, the draft when there is one, otherwise the live edition, picked from a switch; its form and its lesson plans open in drawers) and **History** (the editions the live one replaced, read-only). From Content, "Start a new edition" copies the live edition, its modules and its own lesson plans into a draft numbered next (or "Start the first edition" starts an empty one); a course has one draft at a time. "Publish edition N" and "Discard draft" are for the Training Admin and leads, each behind a confirm. Course versions and lesson plans are out of the nav; their pages still open by link, and course versions have no Duplicate.
- **Parent tasks expand.** Adding a task that has tasks beneath it to a lesson plan's theory items or a scenario's practical tasks adds a row for each of them when the record is saved, once; rows can then be removed or reordered, and later additions to the tree change nothing.
- **Edition numbers.** A course version is shown as an edition ("X-TWR edition 2"). Its number is given when it is first saved, one more than its course's highest, starting at 1, and never changes; a number sent with a save is ignored. No two editions of one course share a number: moving a version into a course that already has its number is refused, and of two editions started at the same moment the later save is refused by a unique index ("Value must be unique"), and saving it again numbers it.
- **Publishing.** A Training Admin or lead publishes a draft from its course's Content tab (or sets a course version's Status to Published and saves); it is dated when it is published. The version must name a grading scale, and every lesson plan in its modules needs a code, a title, a minimum and at least one theory item or scenario, with nothing retired; otherwise the save is refused with every fault listed. A published version becomes the course's current version; the one before stays as data. Only its grading scale is then fixed: it cannot be swapped, and a scale a published version uses cannot gain, lose or reorder points, though their wording still saves. Everything else in it stays editable by the Training Admin and leads. A course author still edits the wording and teacher notes of its lesson plans and scenarios, but is refused structural changes there: adding a lesson plan, changing a lesson plan's theory items, their order, its minimum or the scenarios it offers, or the practical tasks or required flags of a scenario it offers.
- **Credentials.** Every certification and endorsement Indy issues: a unique code, its kind, a name and description, and for a certification its rank on the ladder (no two share one) and the VATSIM ratings that grant it on arrival. A rank or arrival ratings on an endorsement are refused. The list started as a copy of training-tools' own, which reads it from here in a later release; until then a change is made in both. The Training Admin and leads keep it; every account may read it.
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
- **Where the styles live.** `src/app/(payload)/custom.scss` lists the partials in `src/app/(payload)/_styles/`: `_palette` (the Tailwind colours, as `--tw-*` properties), `_base` (font, corners, status colours and small fixes for both themes), `_light`, `_dark`, `_nav` (the sidebar), and `_competencies` (the Competencies list's tabs and tree). They set Payload's own theme variables and override its stock rules, which sit in a lower CSS layer, so no `!important` is needed.

## Data

The Postgres database lives in the `payload_db-data` Docker volume on the VPS, named after the repository. It is backed up every 6 hours (see [Backups](#backups)). Renaming the repository starts the app on a new, empty volume.

Every record's id is a version 7 UUID, not a counter, so an id stored by another system (training-tools, Jira) means the same record in every copy of the database.

Uploads live in two Cloudflare R2 buckets:

| Collection      | Bucket            | Who can read a file                                                         |
| --------------- | ----------------- | --------------------------------------------------------------------------- |
| `media`         | `payload-media`   | Anyone with its URL. Served by Cloudflare from `media.flyindycenter.com`.   |
| `private-media` | `payload-private` | Signed-in users. The bucket has no public access; this app serves the file. |

Don't put anything in `media` that shouldn't be public, including images for pages that aren't published yet. Files over 10 MB are refused.

A bucket is used once all of its `R2_*` settings are present (`deploy/.env.example`). Without them that collection's uploads go to the `payload_media` or `payload_private-media` volume instead, which is what CI and local development do. Files aren't moved when a bucket is switched on or off: uploads made before the switch stop resolving.

## Backups

The VPS's backup runner, deployed from [docker-infrastructure](https://github.com/Indy-Center/docker-infrastructure#backups), backs the CMS up every 6 hours. It runs this repository's recipe, `deploy/backup.sh`, then encrypts the file it writes and sends it to the R2 bucket `indy-center-backups`. The schedule and how long copies are kept are set there, in its `schedule.conf`, not here.

- **The database.** `backup.sh` writes one file, `payload.tar`, while the CMS stays up. It holds `payload.dump`, the whole database from `pg_dump` (including `payload_migrations`, so a restore brings back its schema version), and `row-counts.tsv`, each table's row count from the same moment. The runner's weekly restore check loads the dump into a throwaway database and expects at least those counts.
- **Uploads.** They aren't in `payload.tar`. Each night the runner adds any new files in `payload-media` and `payload-private` to its media copy, which never deletes, so a database from any backup still finds its files. Uploads kept in the `payload_media` and `payload_private-media` volumes, when the buckets aren't configured, aren't backed up.

**To restore**, as `deploy` on the VPS. A "Recover one app" runbook, with helper commands for these steps, is coming to the docs site's Operations section; until then:

```bash
# The runner's own rclone and age, and its R2 key.
export PATH=~/backup-runner/bin:$PATH RCLONE_CONFIG=~/backup-runner/secrets/rclone.conf

# 1. Pick a backup. Names start with their UTC time; frequent/ has the last 14 days,
#    daily/ and monthly/ go further back.
rclone lsf r2:indy-center-backups/frequent/payload/

# 2. Fetch it and decrypt it with the runner's age key.
mkdir -p ~/restore-payload
rclone copy r2:indy-center-backups/frequent/payload/<name>.age ~/restore-payload/
age -d -i ~/backup-runner/secrets/age.key -o ~/restore-payload/payload.tar ~/restore-payload/<name>.age

# 3. Restore it, then delete the unencrypted copy.
cd ~/apps/payload
bash restore.sh ~/restore-payload/payload.tar
rm -rf ~/restore-payload
```

`restore.sh` checks the file, stops the CMS, replaces the whole database with the backup's, and starts the CMS again. Anything saved since that backup is lost. Uploads are left alone.

If loading the backup fails, it leaves the CMS stopped, because started on an empty database the CMS would let anyone create the first admin account. It also leaves a `restore-failed` file in `~/apps/payload/`, and while that is there **Build and Deploy** fails before touching the box. Don't start the CMS or deploy by hand until a restore succeeds: fix the cause and run `restore.sh` again, which removes the file.

The round trip (add content, back up, wipe, restore, check) runs in CI on every pull request, so a change that breaks either script fails there. To run it locally, build the image (`docker build -t ghcr.io/indy-center/payload:latest .`), create the network (`docker network create traefik-shared`), start the stack in `deploy/` with `PAYLOAD_SECRET` and `POSTGRES_PASSWORD` set to any test values and `docker compose up -d`, then run `bash tests/backup/round-trip.sh`. It throws the stack's data away.

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

`build-and-deploy.yml` runs on every push to `main`, and by hand from **Actions → Build and Deploy → Run workflow**. It calls `ci.yml` first and only deploys if it passes, checks the containers are still up 15 seconds later, then requests `/api/users/init` through Traefik on that server, whichever server DNS points at. [Deploying to the VPS](https://tech.flyindycenter.com/patterns/vps-apps/) describes the pipeline.

Before the first deploy:

1. An org admin adds this repository to the organization's four settings for the server it runs on, named by `SERVER` at the top of `build-and-deploy.yml`: `ALEXANDRIA_HOST`, `ALEXANDRIA_DEPLOY_USER`, `ALEXANDRIA_DEPLOY_SSH_KEY` and `ALEXANDRIA_KNOWN_HOSTS`. The deploy's first step names any it can't see.
2. Set the repository's `ENV_*` secrets and variables; `deploy/.env.example` describes each one. Keep the source copies in 1Password.
3. If the VPS can't pull the image, GHCR created the package private. Make `ghcr.io/indy-center/payload` public in the package's settings and re-run the workflow.
4. Open <https://cms.flyindycenter.com/admin> straight away and create the first admin account. Until someone does, anyone who finds the address can.

`ENV_POSTGRES_PASSWORD` is only read when the database volume is first created. Changing the secret afterwards doesn't change the database's password, and the app can no longer connect.

## Disclaimer

We are not affiliated with the FAA or any aviation governing body. This software is for flight simulation use on the [VATSIM](https://www.vatsim.net) network.
