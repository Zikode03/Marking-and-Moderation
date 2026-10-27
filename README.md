# Prospera Assess — Frontend

**Model training frontend:** run `./Start-TrainingStudio.ps1` and open
`http://localhost:5173/training`. The connected local studio includes architecture
views, dataset imports, live training controls and checkpoint experiments.
It operates in training-only mode. See [Model Studio](ai_training/STUDIO.md).

React + TypeScript workspace for uploading existing papers, memorandums and candidate scripts, local AI marking, moderation and approval. Assessment authoring is disabled. From-scratch handwriting recognition and rubric-scoring models, local training tools, held-out evaluation and a file-marking adapter are implemented. You must train and academically validate them using your own verified data. The initial pipeline uses reviewed fixed answer-booklet layouts. See [training instructions](ai_training/START_HERE.md). See [AI_MARKING.md](docs/AI_MARKING.md).

## Run

```bash
npm ci
npm run dev
```

Backend expected at `http://localhost:5080`. Override with `VITE_API_URL`.

The backend now uses a layered ABP solution. Open its `ProsperaAssess.sln` and select **ProsperaAssess.HttpApi.Host** as the Visual Studio startup project. Run **ProsperaAssess.DbMigrator** before starting a Release deployment. Existing accounts and API routes are preserved. See [ABP_BACKEND.md](docs/ABP_BACKEND.md) for the architecture and startup commands.

For the local Docker setup, the explicit migration command is `docker compose --env-file .env.docker --profile tools run --rm dbmigrator`. Clone the backend beside this repository, or set `BACKEND_CONTEXT` in the ignored Docker environment file.

## Sign in

First choose **Institution** (university, college or training provider) or **School** (school education), then choose **Public** or **Private** before entering staff credentials. Schools must also select their assessment pathway: **CAPS / DBE** or **IEB**. Public/private and pathway are separate selections; private schools can choose CAPS / DBE too. The choices are preserved for the browser-tab session and pre-fill school assessment settings. Teacher, lecturer, professor and management access is determined from server-assigned roles and persisted academic allocations. The organisation, sector and pathway choices are navigation context, not a tenant switch: the backend account SchoolId remains the authority for data access. This change does not create institution records or a public organisation directory.

Sign-in supports password visibility, clear error messages and account-help guidance. Refreshing the page restores the current browser-tab session. Signing out clears that session. Passwords and access tokens are not saved to browser storage. Deployed environments keep the refresh token in a Secure, HttpOnly cookie; session storage holds only a non-secret marker and the workspace selection. Local development retains the bearer-token adapter.

The public landing page uses a photographic education layout with feature summaries and school, college and university entry cards. Get started opens the existing staff sign-in steps in a modal. The marked-script preview and lower get-started panel have been removed.

The landing layout fits one viewport across phone, tablet and desktop sizes. How it works plays a real, silent 30-second captioned app walkthrough with playback controls. Sign-in remains a separate modal with the existing organisation, sector and school-pathway choices. See [LANDING_DESIGN.md](docs/LANDING_DESIGN.md) for asset sources and implementation notes.

Use Node.js 22.13+ or a supported newer version. Run `npm test` for sign-in, role-navigation, session-renewal and sign-out regression checks, and `npm run build` for the production build.

School pathways are presented as assessment routes, not two unrelated curricula: [IEB subject assessment guidance](https://www.ieb.co.za/assessment/high-schools/national-senior-certificate/nsc-subject-assessment-guidelines) explains that its NSC examinations are based on CAPS.

## Academic workspaces

The role dashboard, separate work queues, guided uploads and script review desk are described in [UI_WORKFLOW.md](docs/UI_WORKFLOW.md). Review drafts are kept in memory while switching scripts; confirm moderation to save a decision to the server.

Open **AI & Training → Open Model Studio**, or visit `/training`, to see the connected models, import reviewed datasets, start/stop/resume runs, follow actual epoch measurements, and try completed research checkpoints. The labelling desk is embedded in the studio and also available offline. See [the studio guide](ai_training/STUDIO.md).

- **School:** Grades 8–12, subjects, teacher allocations, grade/subject assessments and learner marking.
- **Institution:** faculties, modules, lecturer/professor allocations, academic-year/semester assessments and student marking.

Administrators manage responsibilities under **Teaching staff** or **Academic staff**. New teaching accounts require an initial allocation. See [ACADEMIC_STRUCTURE.md](docs/ACADEMIC_STRUCTURE.md) for setup, access rules and the additive database upgrade.

## Institution and operational modules

See [the module implementation guide](docs/PRODUCT_MODULES.md) for institution setup, enrolments, invitations, assessment versions, moderation assignments, reporting, CSV exchange and marked-script preparation. The frontend and backend include matching API changes; apply the backend `InstitutionModules` migration before deploying this version.

## Staging and account security

See [the phase 1–3 deployment guide](docs/STAGING_AND_SECURITY.md). The supported backend stack is .NET 10 / ABP 10.7.0. Staging uses HTTPS, a restricted database identity, separate migrations, mounted secret files, password recovery, authenticator MFA and session revocation. Domain, hosting and outgoing mail credentials must be supplied before a live staging release. OpenAPI validation is part of the backend test and CI workflows.
