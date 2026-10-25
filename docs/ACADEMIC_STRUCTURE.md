# Schools and institutions

These workspaces have separate academic structures; they do not just change their headings.

| Workspace | Structure | Teaching role | Allocation |
| --- | --- | --- | --- |
| School | Grades 8–12 → subjects → assessments | Teacher | Grade + subject |
| Institution | Faculties → modules → assessments | Lecturer or Professor | Faculty module |

Teachers can have several grade/subject allocations. Lecturers and professors can have several modules, including modules in different faculties where authorised. The faculty is determined by the module, so a module cannot be assigned under the wrong faculty.

## School setup

1. Sign in through School as the administrator.
2. Open Teaching staff. Create a teacher account with its initial grade and subject, or allocate an additional grade/subject to an existing teacher.
3. Grades & subjects shows the Grade 8–12 structure and configured teaching subjects.
4. Upload existing question papers, approved memorandums and scripts for a grade, subject and term, with CAPS / DBE or IEB metadata. Assessment authoring is disabled.
5. A teacher sees and marks work only for the allocated grades and subjects.

## Institution setup

1. Sign in through Institution as the administrator.
2. In Faculties & modules, create a faculty and add its modules. Faculty and module names/codes are editable.
3. In Academic staff, create a Lecturer or Professor account and select its initial faculty module. Additional modules can be allocated separately.
4. Script uploads select a faculty, module, academic year and semester. School grade/subject fields are not shown. Existing papers and memorandums are uploaded; assessments are not authored here.
5. Lecturers and professors see and mark only their allocated modules.

## Access and existing data

The backend enforces allocations on assessment and submission reads/writes, including direct URLs. Client choices cannot grant academic responsibilities. Teachers cannot use the institution staff workspace; lecturers/professors cannot use the school staff workspace. Authorised leadership accounts retain oversight and management capabilities.

The tenant key remains the existing account SchoolId, including for institution faculties and modules. Public/private and the sign-in pathway remain workspace/assessment metadata, not a way to change the tenant or bypass allocations.

Existing assessments, learner work, accounts and marking history are preserved. Historical assessments with neither school nor institution context remain visible to leadership as unclassified records; they are not silently assigned to a teacher or lecturer. They need classification before teaching staff can mark them.

New teaching accounts and their initial allocations are created in one database transaction. An administrator must add a replacement before removing a staff member's last allocation.

## Database upgrade

The backend adds Faculties, Modules and StaffAllocations tables, plus a nullable InstitutionJson assessment column. Development/Debug startup applies an additive, idempotent upgrade while holding a SQL application lock. It never drops or rewrites existing assessments or users. Release installations with Database:Initialize=false must apply the supplied academic-schema-v1.sql before starting the updated app. This targeted upgrade does not replace the broader EF migration-baseline work documented in the backend review.
