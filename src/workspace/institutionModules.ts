export type ManagedRecord = {
  id: string;
  kind: string;
  code: string;
  name: string;
  fields: Record<string, string>;
  active: boolean;
  revision: number;
};
export type Field = {
  key: string;
  label: string;
  type?: 'email' | 'date' | 'number' | 'color' | 'textarea';
  options?: string[];
  reference?: string;
  required?: boolean;
};
export type ModuleDefinition = {
  key: string;
  label: string;
  description: string;
  codeLabel?: string;
  nameLabel?: string;
  singleton?: boolean;
  fields: Field[];
};
export const institutionModules: ModuleDefinition[] = [{
  key: 'institution',
  label: 'Institution',
  description: 'Register your institution profile and branding within your existing account.',
  singleton: true,
  fields: [{
    key: 'type',
    label: 'Institution type',
    options: ['school', 'college', 'university'],
    required: true
  }, {
    key: 'sector',
    label: 'Sector',
    options: ['public', 'private'],
    required: true
  }, {
    key: 'pathway',
    label: 'Curriculum / pathway'
  }, {
    key: 'brandColor',
    label: 'Brand colour',
    type: 'color',
    required: true
  }, {
    key: 'contactEmail',
    label: 'Contact email',
    type: 'email'
  }]
}, {
  key: 'branch',
  label: 'Branches',
  description: 'Manage campuses and school branches.',
  fields: [{
    key: 'address',
    label: 'Address',
    type: 'textarea'
  }, {
    key: 'contactEmail',
    label: 'Contact email',
    type: 'email'
  }]
}, {
  key: 'subject',
  label: 'Subjects',
  description: 'Maintain curriculum and language for your subject catalogue.',
  fields: [{
    key: 'curriculum',
    label: 'Curriculum',
    required: true
  }, {
    key: 'language',
    label: 'Teaching language',
    required: true
  }]
}, {
  key: 'qualification',
  label: 'Qualifications',
  description: 'Link qualifications to faculties and define study levels.',
  fields: [{
    key: 'facultyId',
    label: 'Faculty',
    reference: 'faculty'
  }, {
    key: 'studyLevels',
    label: 'Number of study levels',
    type: 'number',
    required: true
  }]
}, {
  key: 'module',
  label: 'Module study levels',
  description: 'Place a faculty module within a qualification, study level and semester.',
  fields: [{
    key: 'moduleId',
    label: 'Faculty module',
    reference: 'module',
    required: true
  }, {
    key: 'qualificationId',
    label: 'Qualification',
    reference: 'qualification',
    required: true
  }, {
    key: 'studyLevel',
    label: 'Study level',
    type: 'number',
    required: true
  }, {
    key: 'semester',
    label: 'Semester',
    type: 'number',
    required: true
  }]
}, {
  key: 'class',
  label: 'Classes',
  description: 'Create school classes or university cohorts for an academic year.',
  fields: [{
    key: 'branchId',
    label: 'Branch',
    reference: 'branch'
  }, {
    key: 'academicYear',
    label: 'Academic year',
    type: 'number',
    required: true
  }, {
    key: 'grade',
    label: 'School grade (8-12)',
    type: 'number'
  }, {
    key: 'qualificationId',
    label: 'University qualification',
    reference: 'qualification'
  }, {
    key: 'studyLevel',
    label: 'University study level',
    type: 'number'
  }]
}, {
  key: 'learner',
  label: 'Learners & students',
  codeLabel: 'Candidate / student reference',
  nameLabel: 'Full name',
  description: 'Candidate references must match script filenames.',
  fields: [{
    key: 'branchId',
    label: 'Branch',
    reference: 'branch'
  }, {
    key: 'email',
    label: 'Email (optional)',
    type: 'email'
  }]
}, {
  key: 'enrolment',
  label: 'Enrolments',
  description: 'Link a learner to a class or module for an academic year.',
  fields: [{
    key: 'learnerId',
    label: 'Learner / student',
    reference: 'learner',
    required: true
  }, {
    key: 'classId',
    label: 'Class / cohort',
    reference: 'class'
  }, {
    key: 'moduleId',
    label: 'Module',
    reference: 'module'
  }, {
    key: 'academicYear',
    label: 'Academic year',
    type: 'number',
    required: true
  }, {
    key: 'semester',
    label: 'Semester',
    type: 'number'
  }]
}, {
  key: 'session',
  label: 'Examination sessions',
  description: 'Organise examination and assessment periods.',
  fields: [{
    key: 'academicYear',
    label: 'Academic year',
    type: 'number',
    required: true
  }, {
    key: 'term',
    label: 'School term',
    type: 'number'
  }, {
    key: 'semester',
    label: 'University semester',
    type: 'number'
  }, {
    key: 'startsOn',
    label: 'Start date',
    type: 'date',
    required: true
  }, {
    key: 'endsOn',
    label: 'End date',
    type: 'date',
    required: true
  }]
}, {
  key: 'assessment',
  label: 'Assessment sessions',
  description: 'Link uploaded assessments to examination sessions and classes.',
  fields: [{
    key: 'assessmentId',
    label: 'Assessment',
    reference: 'assessment',
    required: true
  }, {
    key: 'sessionId',
    label: 'Session',
    reference: 'session',
    required: true
  }, {
    key: 'classId',
    label: 'Class / cohort',
    reference: 'class'
  }]
}, {
  key: 'settings',
  label: 'Policies & settings',
  description: 'Versioned policy changes are retained in the audit. Retention records your policy; files are never automatically deleted.',
  singleton: true,
  fields: [{
    key: 'language',
    label: 'Preferred language',
    required: true
  }, {
    key: 'requireEnrolment',
    label: 'Require enrolled candidates on upload',
    options: ['false', 'true'],
    required: true
  }, {
    key: 'requireMemoApproval',
    label: 'Require independent memorandum approval before marking',
    options: ['false', 'true'],
    required: true
  }, {
    key: 'retentionDays',
    label: 'Retention policy (days)',
    type: 'number',
    required: true
  }, {
    key: 'moderationSamplePercent',
    label: 'Moderation sample (%)',
    type: 'number',
    required: true
  }, {
    key: 'markingPolicy',
    label: 'Marking policy and review guidance',
    type: 'textarea',
    required: true
  }]
}, {
  key: 'integration',
  label: 'Integration register',
  description: 'Record integration contacts and requirements. Credentials and live connections are configured separately.',
  fields: [{
    key: 'provider',
    label: 'Service / provider',
    required: true
  }, {
    key: 'contactEmail',
    label: 'Support contact',
    type: 'email'
  }, {
    key: 'notes',
    label: 'Integration requirements (do not enter credentials)',
    type: 'textarea'
  }]
}];
