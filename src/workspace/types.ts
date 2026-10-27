export type Criterion = { id: string; name: string; maxMarks: number };
export type SchoolContext = { academicYear?: number | null; subject: string; grade: number; term: number; assessmentType: string; schoolType: string; pathway: string; weightPercent: number };
export type InstitutionContext = { facultyId: string; facultyName: string; moduleId: string; moduleCode: string; moduleName: string; academicYear: number; semester: number; assessmentType: string; weightPercent: number };
export type Assessment = { id: string; title: string; code: string; totalMarks: number; criteria: Criterion[]; school: SchoolContext | null; institution: InstitutionContext | null };
export type Submission = { id: string; assessmentId: string; studentReference: string; answerText: string; status: string; marks: Record<string, number>; feedback: string | null; total: number; revision: number; audit: { at: string; actor: string; action: string; notes: string }[] };
export type Faculty = { id: string; name: string; code: string };
export type Module = { id: string; facultyId: string; name: string; code: string };
export type Allocation = { id: string; userId: string; grade: number | null; subject: string | null; moduleId: string | null };
export type Staff = { id: string; email: string; roles: string[] };
export type Academics = { grades: number[]; faculties: Faculty[]; modules: Module[]; allocations: Allocation[]; staff: Staff[] };
export const emptyAcademics: Academics = { grades: [8, 9, 10, 11, 12], faculties: [], modules: [], allocations: [], staff: [] };
export type RunAction = (operation: () => Promise<unknown>, message: string) => Promise<boolean>;
export function assessmentContext(assessment?: Assessment) {
  if (assessment?.school) return `Grade ${assessment.school.grade} · ${assessment.school.subject} · Term ${assessment.school.term}`;
  if (assessment?.institution) return `${assessment.institution.facultyName} · ${assessment.institution.moduleCode} · Semester ${assessment.institution.semester}, ${assessment.institution.academicYear}`;
  return 'Academic context not yet assigned';
}
