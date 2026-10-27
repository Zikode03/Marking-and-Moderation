# Prospera Assess module implementation

The application now includes working institution management and operational modules alongside the existing marking and training workflows. This is an implementation inventory, not a production certification.

| Module | Implemented behaviour |
| --- | --- |
| Institution management | Register the current account institution as school, college or university; maintain branches, contact details and brand colour; show institution branding in the workspace. Account institution scope is assigned server-side, never supplied by the browser. |
| Users and roles | Existing staff creation plus seven-day single-use invitations, initial teaching allocations, staff activation/deactivation and role management. Roles include a dedicated Moderator. Disabled accounts lose API access. Administrators cannot change their own access. |
| Academic management | Existing grades, allocations, faculties and modules plus managed subjects, qualifications, study levels, module/qualification mapping, classes/cohorts, years, semesters and sessions. |
| Learners and students | Stable candidate references, learner records, class/module enrolments, CSV exchange, archive protection and links to approved academic history. |
| Assessments | Link uploaded assessments to sessions/classes. Retain original paper/memo versions and link replacement uploads to predecessors. Independent memorandum approval may be required by institution policy. |
| Scripts | Existing original storage, file checks and queues plus duplicate checks across matching academic contexts, optional enrolled-candidate matching and recorded document access. |
| Teacher review | Existing marks and feedback review plus correction of answer transcriptions. Original results remain in audit snapshots. |
| Moderation | Assigned independent reviewers, enforced assigned decision-makers, due dates, correction loops and recorded reproducible inspection samples. Sampling never bypasses mandatory review, moderation or approval. |
| Results and reporting | Approved-only reports, session/class filtering, script-percentage summary, CSV exports and downloadable individual learner reports with reviewed feedback. |
| Notifications and tasks | Role/assignment-aware task lists, overdue dates and a periodically refreshed outstanding-task indicator. Work resolves as scripts progress. |
| Audit | Institution changes, staff invitations/access changes, assignments, samples, report access and document downloads alongside existing result decision history. Search recent institution events and workflow history. |
| Settings | Versioned academic/marking guidance, language preference, retention policy, sampling percentage, enrolment requirement and memorandum-approval requirement. |
| Integrations | CSV import/export for registry records and approved results; provider/contact/requirements register. External service connections require a chosen provider and credentials. |
| Training preparation | Marked-source declaration, learner-only transcription/crop confirmation, annotation-handling notes, academic scope and pseudonymised learner groups. Independent verification remains required for training exports. Preparation rejects mixed declared scopes or incompatible school/module/language contexts and groups related learner scripts in one split. |

## Use

Administrators open **Institution management** to register the profile and configure branches, subjects, qualifications, classes, examination sessions and settings. **Learners & enrolments** manages candidate records. **Staff access** manages roles and invitation links. Teaching allocations remain under **Teaching staff / Academic staff**.

**Assessment documents** shows immutable originals, predecessor links and memo approvals. To upload corrected documents, select a previous batch in the upload wizard's Document revision field. **Moderation assignments** records reviewers, deadlines and inspection samples. **Tasks & notifications**, **Results & reports** and **Audit history** follow those workflows.

Registry CSV headers use `code,name` and the field keys provided by **Export CSV / template**. Imports create 1-500 records in one transaction; one invalid row rolls back the entire import. Use existing identifiers from exported reference records for linked values. Archived identifiers and codes remain reserved. CSV exports protect against spreadsheet formula injection.

## Database and deployment

The additive `InstitutionModules` migration creates institution records and audit event tables. Existing assessments, scripts, identity data and result history remain intact. New variable record fields are validated against module-specific field lists and institution-scoped references on the server; revisions detect conflicting edits.

Run the existing backend DbMigrator with the intended environment's connection configuration before deploying the new host. The frontend and backend must be released together. Re-run the migration on a backup or staging copy first when upgrading an existing deployment. No credentials or real training data are committed.

## Explicit boundaries

- Institution registration is for the institution already assigned to the account. Public self-service onboarding, billing and switching a single identity between independently administered institutions are not included.
- Email/SMS delivery and Microsoft/Moodle connectors are not configured. Invitation links are shared manually; task notifications currently operate in the application.
- Retention settings record policy; no automated destruction or backup service is enabled. Integration entries do not establish live connections or store credentials.
- Branding supports the institution name and colour, not logo uploads or custom domains.
- Training preparation uses human-reviewed transcriptions and selected crops. It does not automatically erase teacher handwriting or reconstruct obscured learner text.
- Real academic data collection, model training, representative evaluation and academic release approval still depend on your data. The supplied fictional tests do not establish marking accuracy.
- Overall generated learner feedback remains score-based English text. Teachers can correct it; multilingual and answer-specific generative feedback need additional development and evaluation.
