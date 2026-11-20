/**
 * MarkSure Institutional Academic Policy & Grading Configuration
 */

export const INSTITUTION_CONTEXT = {
  systemName: 'MarkSure',
  systemSubtitle: 'Academic Examination Publishing & Cryptographic Verification Platform',
  institutionLabel: 'Office of the Controller of Examinations',
  campusLocation: 'Phagwara, Punjab, India',
  academicSession: '2026–27',
  academicTermCode: '2026-27-SEM1',
  programme: 'Bachelor of Technology (B.Tech)',
  programmeShort: 'B.Tech CSE',
  department: 'School of Computer Science and Engineering',
  examinationName: 'End-Term Examination (Semester 1)',
  semester: 1,
  governanceNotice:
    'All published academic records are hashed into a SHA-256 Merkle tree and signed with the institution’s Ed25519 key. Post-publication modifications require two independent cryptographic approvals.',
};

export interface CourseCatalogItem {
  code: string;
  name: string;
  credits: number;
  max_marks: number;
  category: 'Core Theory' | 'Engineering Science' | 'Laboratory' | 'Ability Enhancement';
}

export const SEMESTER_1_COURSES: CourseCatalogItem[] = [
  {
    code: 'CSE101',
    name: 'Programming Fundamentals',
    credits: 4,
    max_marks: 100,
    category: 'Core Theory',
  },
  {
    code: 'MTH165',
    name: 'Engineering Mathematics',
    credits: 4,
    max_marks: 100,
    category: 'Engineering Science',
  },
  {
    code: 'PHY109',
    name: 'Applied Physics',
    credits: 4,
    max_marks: 100,
    category: 'Engineering Science',
  },
  {
    code: 'MEC107',
    name: 'Engineering Graphics',
    credits: 3,
    max_marks: 100,
    category: 'Engineering Science',
  },
  {
    code: 'PEL121',
    name: 'Communication Skills',
    credits: 3,
    max_marks: 100,
    category: 'Ability Enhancement',
  },
  {
    code: 'CSE102',
    name: 'Computer Programming Lab',
    credits: 2,
    max_marks: 100,
    category: 'Laboratory',
  },
];

const CREDITS_BY_CODE: Record<string, number> = Object.fromEntries(
  SEMESTER_1_COURSES.map((c) => [c.code, c.credits])
);

export interface GradeBand {
  letter: string;
  gradePoint: number;
  descriptor: string;
  minMarks: number;
  maxMarks: number;
  passed: boolean;
}

export const GRADING_SCALE: GradeBand[] = [
  { letter: 'O', gradePoint: 10, descriptor: 'Outstanding', minMarks: 90, maxMarks: 100, passed: true },
  { letter: 'A+', gradePoint: 9, descriptor: 'Excellent', minMarks: 80, maxMarks: 89, passed: true },
  { letter: 'A', gradePoint: 8, descriptor: 'Very Good', minMarks: 70, maxMarks: 79, passed: true },
  { letter: 'B+', gradePoint: 7, descriptor: 'Good', minMarks: 60, maxMarks: 69, passed: true },
  { letter: 'B', gradePoint: 6, descriptor: 'Above Average', minMarks: 50, maxMarks: 59, passed: true },
  { letter: 'C', gradePoint: 5, descriptor: 'Average', minMarks: 40, maxMarks: 49, passed: true },
  { letter: 'F', gradePoint: 0, descriptor: 'Reappear / Fail', minMarks: 0, maxMarks: 39, passed: false },
];

export function getCourseCredits(code: string): number {
  return CREDITS_BY_CODE[code.trim().toUpperCase()] ?? 3;
}

export function evaluateSubjectGrade(marks: number): GradeBand {
  const rounded = Math.round(Number(marks));
  for (const band of GRADING_SCALE) {
    if (rounded >= band.minMarks) {
      return band;
    }
  }
  return GRADING_SCALE[GRADING_SCALE.length - 1];
}

export interface AcademicSummary {
  totalObtained: number;
  totalMax: number;
  percentage: string;
  totalCredits: number;
  earnedCredits: number;
  sgpa: string;
  resultStatus: 'PASS' | 'REAPPEAR';
}

export function calculateAcademicSummary(
  subjects: {
    subject_code?: string;
    code?: string;
    marks?: number | null;
    verified_snapshot_marks?: number | null;
    max_marks?: number;
  }[]
): AcademicSummary {
  let totalObtained = 0;
  let totalMax = 0;
  let totalCredits = 0;
  let earnedCredits = 0;
  let weightedGradePoints = 0;
  let allPassed = true;

  for (const s of subjects) {
    const code = (s.subject_code || s.code || '').toUpperCase();
    const marks = Number(s.verified_snapshot_marks ?? s.marks ?? 0);
    const maxMarks = Number(s.max_marks ?? 100);
    const credits = getCourseCredits(code);
    const grade = evaluateSubjectGrade(marks);

    totalObtained += marks;
    totalMax += maxMarks;
    totalCredits += credits;
    weightedGradePoints += credits * grade.gradePoint;

    if (grade.passed) {
      earnedCredits += credits;
    } else {
      allPassed = false;
    }
  }

  const percentage = totalMax > 0 ? ((totalObtained / totalMax) * 100).toFixed(2) : '0.00';
  const sgpa = totalCredits > 0 ? (weightedGradePoints / totalCredits).toFixed(2) : '0.00';

  return {
    totalObtained,
    totalMax,
    percentage,
    totalCredits,
    earnedCredits,
    sgpa,
    resultStatus: allPassed && subjects.length > 0 ? 'PASS' : 'REAPPEAR',
  };
}
