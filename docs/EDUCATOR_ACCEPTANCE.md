# Educator and production acceptance

Use authorised synthetic or de-identified data in isolated staging. Record the release SHAs, browser/device, institution, participant role, date, result and issue reference for every scenario. A passing automated test does not replace educator sign-off or validate AI marking accuracy.

| Scenario | Expected result | Reviewer |
| --- | --- | --- |
| Teacher signs in for a school | Only allocated Grade 8–12 subjects and their scripts are visible | Teacher |
| Lecturer/professor signs in | Faculty/module allocations determine visible work | Lecturer/professor |
| Upload existing paper, memo and scripts | No assessment authoring; candidate IDs and academic context confirmed; files saved once | Educator |
| Scanner unavailable/infected file/quota reached | Clear rejection, no partial batch, safe retry | Administrator |
| Model absent, unsupported scope or unreadable answer | Marking abstains or flags review; no invented final marks | Educator |
| Teacher checks a provisional result | Every question checked against source and memo; corrections, feedback and reasons saved | Teacher |
| HOD returns work | Teacher must review again before moderation; no bypass to approval | HOD |
| Independent HOD moderation | Self-moderation rejected; marks stay within memo limits | HOD |
| Final approval | Approval only after moderation; late edits and stale revisions rejected | Principal/authorised approver |
| CSV/report/download | Only approved results released; totals, feedback, candidate references and print layout checked | Educator and approver |
| Institution isolation | Another institution and an unallocated staff member cannot read files or results | Administrator |
| Appeals and retention | Hold blocks deletion; only expired approved work eligible; explicit confirmation required | Academic/privacy owner |
| Training export | Blocked without institutional authorisation; labels independently verified; content privacy-reviewed | Dataset/privacy owner |
| MFA and recovery | Setup, login, recovery code, lost authenticator, password reset and session revocation work | Administrator |
| Keyboard and practical devices | All actions labelled and reachable; no blocked focus; errors and retries understandable | Educators |
| Recovery drill | Encrypted off-host backup restored with keys, data checked and purge ledger reconciled | DBA/operator |
| Load and operational failure | Representative upload/marking/export load, service outage, disk capacity and alerts tested | Operator |

Do not deploy the synthetic model transport used in tests. Training and independent academic evaluation must establish the supported subject, grade/module, written language and page-layout combinations before a real pilot.

Release approval requires the institution's academic owner, privacy/data owner and hosting operator. Record outstanding issues and explicitly reject a release with missing restore evidence, public document access, skipped moderation, unverified model scope or unresolved high-severity security findings. Independent penetration testing and educator sessions remain real-world acceptance work, not something CI can sign on their behalf.
