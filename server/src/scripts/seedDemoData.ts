import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { getSupabaseAdmin } from '../config/supabase.js';
import {
  CorrectionApprovalPayload,
  normalizeResultSnapshot,
  PublicationManifestPayload,
  ResultSnapshotPayload,
  SubjectMark,
} from '../crypto/canonical.js';
import { computeLeafHash } from '../crypto/hash.js';
import { buildMerkleTree } from '../crypto/merkle.js';
import {
  computeCorrectionPayloadHash,
  signCorrectionApproval,
  signPublicationManifest,
} from '../crypto/signatures.js';
import { DEMO_PROFILES } from '../middleware/auth.js';
import { appendLedgerEvent } from '../services/ledger.js';
import { verifySingleResultFromDb } from '../services/verificationService.js';

export const INSTITUTIONAL_STUDENTS: {
  id: string;
  profileKey: string | null;
  email: string;
  roll_number: string;
  full_name: string;
  department: string;
  semester: number;
  subjects: SubjectMark[];
}[] = [
  {
    id: '00000000-0000-0000-0000-000000000201',
    profileKey: 'demo-student-1',
    email: 'harnoor.singh@student.marksure.edu',
    roll_number: 'REG-2026-CSE-001',
    full_name: 'Harnoor Singh',
    department: 'Computer Science and Engineering',
    semester: 1,
    subjects: [
      { code: 'CSE101', name: 'Programming Fundamentals', marks: 88, max_marks: 100 },
      { code: 'MTH165', name: 'Engineering Mathematics', marks: 84, max_marks: 100 },
      { code: 'PHY109', name: 'Applied Physics', marks: 79, max_marks: 100 },
      { code: 'MEC107', name: 'Engineering Graphics', marks: 86, max_marks: 100 },
      { code: 'PEL121', name: 'Communication Skills', marks: 91, max_marks: 100 },
      { code: 'CSE102', name: 'Computer Programming Lab', marks: 94, max_marks: 100 },
    ],
  },
  {
    id: '00000000-0000-0000-0000-000000000202',
    profileKey: null,
    email: 'simran.kaur@student.marksure.edu',
    roll_number: 'REG-2026-CSE-002',
    full_name: 'Simran Kaur',
    department: 'Computer Science and Engineering',
    semester: 1,
    subjects: [
      { code: 'CSE101', name: 'Programming Fundamentals', marks: 85, max_marks: 100 },
      { code: 'MTH165', name: 'Engineering Mathematics', marks: 76, max_marks: 100 },
      { code: 'PHY109', name: 'Applied Physics', marks: 82, max_marks: 100 },
      { code: 'MEC107', name: 'Engineering Graphics', marks: 80, max_marks: 100 },
      { code: 'PEL121', name: 'Communication Skills', marks: 88, max_marks: 100 },
      { code: 'CSE102', name: 'Computer Programming Lab', marks: 90, max_marks: 100 },
    ],
  },
  {
    id: '00000000-0000-0000-0000-000000000203',
    profileKey: null,
    email: 'arshdeep.gill@student.marksure.edu',
    roll_number: 'REG-2026-CSE-003',
    full_name: 'Arshdeep Gill',
    department: 'Computer Science and Engineering',
    semester: 1,
    subjects: [
      { code: 'CSE101', name: 'Programming Fundamentals', marks: 68, max_marks: 100 },
      { code: 'MTH165', name: 'Engineering Mathematics', marks: 74, max_marks: 100 },
      { code: 'PHY109', name: 'Applied Physics', marks: 71, max_marks: 100 },
      { code: 'MEC107', name: 'Engineering Graphics', marks: 77, max_marks: 100 },
      { code: 'PEL121', name: 'Communication Skills', marks: 79, max_marks: 100 },
      { code: 'CSE102', name: 'Computer Programming Lab', marks: 82, max_marks: 100 },
    ],
  },
  {
    id: '00000000-0000-0000-0000-000000000204',
    profileKey: null,
    email: 'riya.sharma@student.marksure.edu',
    roll_number: 'REG-2026-CSE-004',
    full_name: 'Riya Sharma',
    department: 'Computer Science and Engineering',
    semester: 1,
    subjects: [
      { code: 'CSE101', name: 'Programming Fundamentals', marks: 92, max_marks: 100 },
      { code: 'MTH165', name: 'Engineering Mathematics', marks: 90, max_marks: 100 },
      { code: 'PHY109', name: 'Applied Physics', marks: 87, max_marks: 100 },
      { code: 'MEC107', name: 'Engineering Graphics', marks: 89, max_marks: 100 },
      { code: 'PEL121', name: 'Communication Skills', marks: 93, max_marks: 100 },
      { code: 'CSE102', name: 'Computer Programming Lab', marks: 96, max_marks: 100 },
    ],
  },
  {
    id: '00000000-0000-0000-0000-000000000205',
    profileKey: null,
    email: 'kabir.mehta@student.marksure.edu',
    roll_number: 'REG-2026-CSE-005',
    full_name: 'Kabir Mehta',
    department: 'Computer Science and Engineering',
    semester: 1,
    subjects: [
      { code: 'CSE101', name: 'Programming Fundamentals', marks: 78, max_marks: 100 },
      { code: 'MTH165', name: 'Engineering Mathematics', marks: 73, max_marks: 100 },
      { code: 'PHY109', name: 'Applied Physics', marks: 75, max_marks: 100 },
      { code: 'MEC107', name: 'Engineering Graphics', marks: 81, max_marks: 100 },
      { code: 'PEL121', name: 'Communication Skills', marks: 77, max_marks: 100 },
      { code: 'CSE102', name: 'Computer Programming Lab', marks: 84, max_marks: 100 },
    ],
  },
  {
    id: '00000000-0000-0000-0000-000000000206',
    profileKey: null,
    email: 'navneet.kaur@student.marksure.edu',
    roll_number: 'REG-2026-CSE-006',
    full_name: 'Navneet Kaur',
    department: 'Computer Science and Engineering',
    semester: 1,
    subjects: [
      { code: 'CSE101', name: 'Programming Fundamentals', marks: 83, max_marks: 100 },
      { code: 'MTH165', name: 'Engineering Mathematics', marks: 87, max_marks: 100 },
      { code: 'PHY109', name: 'Applied Physics', marks: 80, max_marks: 100 },
      { code: 'MEC107', name: 'Engineering Graphics', marks: 85, max_marks: 100 },
      { code: 'PEL121', name: 'Communication Skills', marks: 89, max_marks: 100 },
      { code: 'CSE102', name: 'Computer Programming Lab', marks: 91, max_marks: 100 },
    ],
  },
  {
    id: '00000000-0000-0000-0000-000000000207',
    profileKey: null,
    email: 'jasleen.kaur@student.marksure.edu',
    roll_number: 'REG-2026-CSE-007',
    full_name: 'Jasleen Kaur',
    department: 'Computer Science and Engineering',
    semester: 1,
    subjects: [
      { code: 'CSE101', name: 'Programming Fundamentals', marks: 79, max_marks: 100 },
      { code: 'MTH165', name: 'Engineering Mathematics', marks: 81, max_marks: 100 },
      { code: 'PHY109', name: 'Applied Physics', marks: 76, max_marks: 100 },
      { code: 'MEC107', name: 'Engineering Graphics', marks: 78, max_marks: 100 },
      { code: 'PEL121', name: 'Communication Skills', marks: 85, max_marks: 100 },
      { code: 'CSE102', name: 'Computer Programming Lab', marks: 88, max_marks: 100 },
    ],
  },
  {
    id: '00000000-0000-0000-0000-000000000208',
    profileKey: null,
    email: 'manav.verma@student.marksure.edu',
    roll_number: 'REG-2026-CSE-008',
    full_name: 'Manav Verma',
    department: 'Computer Science and Engineering',
    semester: 1,
    subjects: [
      { code: 'CSE101', name: 'Programming Fundamentals', marks: 74, max_marks: 100 },
      { code: 'MTH165', name: 'Engineering Mathematics', marks: 69, max_marks: 100 },
      { code: 'PHY109', name: 'Applied Physics', marks: 72, max_marks: 100 },
      { code: 'MEC107', name: 'Engineering Graphics', marks: 75, max_marks: 100 },
      { code: 'PEL121', name: 'Communication Skills', marks: 80, max_marks: 100 },
      { code: 'CSE102', name: 'Computer Programming Lab', marks: 83, max_marks: 100 },
    ],
  },
];

const DEV_APPROVER_1_PRIV_KEY =
  '1111111111111111111111111111111111111111111111111111111111111111';

export async function ensureDemoDataSeeded(options: { forceReset?: boolean } = {}): Promise<{
  seeded: boolean;
  message: string;
}> {
  const supabase = getSupabaseAdmin();

  const { error: tableCheckError } = await supabase
    .from('profiles')
    .select('id')
    .limit(1);

  if (tableCheckError) {
    return {
      seeded: false,
      message: `Database tables not found or inaccessible (${tableCheckError.message}).`,
    };
  }

  const { data: existingUsersData } = await supabase.auth.admin.listUsers();
  const existingUsersByEmail = new Map<string, string>();
  if (existingUsersData?.users) {
    for (const u of existingUsersData.users) {
      if (u.email) {
        existingUsersByEmail.set(u.email.toLowerCase(), u.id);
      }
    }
  }

  for (const [token, demoProfile] of Object.entries(DEMO_PROFILES)) {
    let authUserId = existingUsersByEmail.get(demoProfile.email.toLowerCase());

    if (!authUserId) {
      const { data: createdAuth, error: createAuthError } =
        await supabase.auth.admin.createUser({
          id: demoProfile.id,
          email: demoProfile.email,
          password: 'Password123!',
          email_confirm: true,
          user_metadata: {
            full_name: demoProfile.full_name,
            role: demoProfile.role,
          },
        });

      if (createAuthError) {
        continue;
      }
      authUserId = createdAuth.user.id;
    }

    DEMO_PROFILES[token].id = authUserId;

    await supabase.from('profiles').upsert(
      {
        id: authUserId,
        email: demoProfile.email,
        full_name: demoProfile.full_name,
        role: demoProfile.role,
        public_key_hex: demoProfile.public_key_hex,
      },
      { onConflict: 'id' }
    );
  }

  // Check if legacy roll numbers exist or forceReset was requested
  const { data: legacyStudents } = await supabase
    .from('students')
    .select('id, roll_number')
    .or('roll_number.like.BT2024%,roll_number.like.LPU-DEMO%');

  const shouldResetAll =
    Boolean(options.forceReset) || (legacyStudents && legacyStudents.length > 0);

  if (shouldResetAll) {
    await supabase.from('correction_approvals').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('correction_requests').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('merkle_proofs').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('result_versions').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('results').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('publication_batches').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('ledger_events').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('students').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  }

  for (const stu of INSTITUTIONAL_STUDENTS) {
    // Create or sync a Supabase Auth account + profile for every student
    let studentAuthId = existingUsersByEmail.get(stu.email.toLowerCase());
    if (!studentAuthId) {
      const { data: createdStuAuth } = await supabase.auth.admin.createUser({
        email: stu.email,
        password: 'Password123!',
        email_confirm: true,
        user_metadata: {
          full_name: stu.full_name,
          role: 'student',
        },
      });
      if (createdStuAuth?.user?.id) {
        studentAuthId = createdStuAuth.user.id;
        existingUsersByEmail.set(stu.email.toLowerCase(), studentAuthId);
      }
    }

    if (studentAuthId) {
      if (stu.profileKey && DEMO_PROFILES[stu.profileKey]) {
        DEMO_PROFILES[stu.profileKey].id = studentAuthId;
      }
      await supabase.from('profiles').upsert(
        {
          id: studentAuthId,
          email: stu.email,
          full_name: stu.full_name,
          role: 'student',
          public_key_hex: null,
        },
        { onConflict: 'id' }
      );
    }

    const profileId =
      studentAuthId || (stu.profileKey ? DEMO_PROFILES[stu.profileKey]?.id || null : null);

    await supabase.from('students').upsert(
      {
        id: stu.id,
        profile_id: profileId,
        roll_number: stu.roll_number,
        full_name: stu.full_name,
        department: stu.department,
        semester: stu.semester,
      },
      { onConflict: 'roll_number' }
    );
  }

  const { data: existingResults } = await supabase
    .from('results')
    .select('id')
    .eq('academic_term', '2026-27-SEM1');

  if (!existingResults || existingResults.length === 0) {
    const academicTerm = '2026-27-SEM1';
    const adminId = DEMO_PROFILES['demo-admin'].id;
    const approver1 = DEMO_PROFILES['demo-approver-1'];

    const { data: dbStudents } = await supabase
      .from('students')
      .select('id, roll_number, full_name')
      .order('roll_number', { ascending: true });

    const stuIdByRoll = new Map((dbStudents || []).map((s) => [s.roll_number, s.id]));

    const prepared: {
      resultId: string;
      studentId: string;
      rollNumber: string;
      snapshot: ResultSnapshotPayload;
      leafHash: string;
    }[] = [];

    for (const stu of INSTITUTIONAL_STUDENTS) {
      const realStudentId = stuIdByRoll.get(stu.roll_number) || stu.id;
      const resultId = crypto.randomUUID();
      const snapshot = normalizeResultSnapshot({
        result_id: resultId,
        student_id: realStudentId,
        roll_number: stu.roll_number,
        academic_term: academicTerm,
        version: 1,
        subjects: stu.subjects,
      });
      const leafHash = computeLeafHash(snapshot);
      prepared.push({
        resultId,
        studentId: realStudentId,
        rollNumber: stu.roll_number,
        snapshot,
        leafHash,
      });
    }

    const merkleTree = buildMerkleTree(prepared.map((p) => p.leafHash));
    const batchId = crypto.randomUUID();
    const publishedAt = new Date().toISOString();

    const manifest: PublicationManifestPayload = {
      batch_id: batchId,
      institution_id: env.institutionId,
      academic_term: academicTerm,
      merkle_root: merkleTree.merkleRoot,
      record_count: prepared.length,
      published_at: publishedAt,
    };

    const institutionSignature = signPublicationManifest(
      manifest,
      env.institutionPrivateKeyHex
    );

    await supabase.from('publication_batches').insert({
      id: batchId,
      batch_name: 'End-Term Examination — B.Tech CSE Semester 1 (Session 2026–27)',
      academic_term: academicTerm,
      merkle_root: merkleTree.merkleRoot,
      record_count: prepared.length,
      manifest_json: manifest,
      institution_signature: institutionSignature,
      institution_public_key: env.institutionPublicKeyHex,
      published_by: adminId,
      published_at: publishedAt,
    });

    for (let i = 0; i < prepared.length; i++) {
      const item = prepared[i];
      const versionId = crypto.randomUUID();

      await supabase.from('results').insert({
        id: item.resultId,
        student_id: item.studentId,
        academic_term: academicTerm,
        subjects_json: item.snapshot.subjects,
        current_version: 1,
        latest_batch_id: batchId,
        status: 'published',
      });

      await supabase.from('result_versions').insert({
        id: versionId,
        result_id: item.resultId,
        version: 1,
        batch_id: batchId,
        snapshot_json: item.snapshot,
        leaf_hash: item.leafHash,
      });

      await supabase.from('merkle_proofs').insert({
        result_version_id: versionId,
        batch_id: batchId,
        leaf_index: i,
        leaf_hash: item.leafHash,
        proof_json: merkleTree.proofs[i],
      });
    }

    await appendLedgerEvent({
      eventType: 'BATCH_PUBLISHED',
      entityId: batchId,
      actorId: adminId,
      payload: {
        batch_id: batchId,
        batch_name: 'End-Term Examination — B.Tech CSE Semester 1 (Session 2026–27)',
        academic_term: academicTerm,
        merkle_root: merkleTree.merkleRoot,
        institution_signature: institutionSignature,
        record_count: prepared.length,
      },
    });

    // Scenario B: Pending Correction Request for Simran Kaur (REG-2026-CSE-002)
    const simranItem = prepared.find((p) => p.rollNumber === 'REG-2026-CSE-002');
    if (simranItem) {
      const corrId = crypto.randomUUID();
      const canonicalPayload: CorrectionApprovalPayload = {
        correction_request_id: corrId,
        result_id: simranItem.resultId,
        from_version: 1,
        subject_code: 'MTH165',
        old_marks: 76,
        new_marks: 84,
        reason:
          'Section C differential equations script re-totaling verified by course coordinator and academic scrutiny board.',
      };
      const payloadHash = computeCorrectionPayloadHash(canonicalPayload);

      await supabase.from('correction_requests').insert({
        id: corrId,
        result_id: simranItem.resultId,
        from_version: 1,
        subject_code: 'MTH165',
        subject_name: 'Engineering Mathematics',
        old_marks: 76,
        new_marks: 84,
        reason: canonicalPayload.reason,
        canonical_payload_json: canonicalPayload,
        payload_hash: payloadHash,
        requested_by: adminId,
        status: 'pending',
      });

      await appendLedgerEvent({
        eventType: 'CORRECTION_REQUESTED',
        entityId: corrId,
        actorId: adminId,
        payload: {
          ...canonicalPayload,
          roll_number: 'REG-2026-CSE-002',
          student_name: 'Simran Kaur',
          requested_by_name: DEMO_PROFILES['demo-admin'].full_name,
        },
      });

      const approver1Sig = signCorrectionApproval(
        canonicalPayload,
        DEV_APPROVER_1_PRIV_KEY
      );

      await supabase.from('correction_approvals').insert({
        correction_request_id: corrId,
        approver_id: approver1.id,
        approver_public_key: approver1.public_key_hex!,
        signature_hex: approver1Sig,
        signed_payload_hash: payloadHash,
      });

      await appendLedgerEvent({
        eventType: 'CORRECTION_APPROVED',
        entityId: corrId,
        actorId: approver1.id,
        payload: {
          correction_request_id: corrId,
          result_id: simranItem.resultId,
          roll_number: 'REG-2026-CSE-002',
          approver_id: approver1.id,
          approver_name: approver1.full_name,
          approver_public_key: approver1.public_key_hex,
          signature_hex: approver1Sig,
          approval_number: 1,
        },
      });
    }

    // Scenario C: Unapproved Direct Database Modification on Arshdeep Gill (REG-2026-CSE-003)
    const arshdeepItem = prepared.find((p) => p.rollNumber === 'REG-2026-CSE-003');
    if (arshdeepItem) {
      const tamperedSubjects = arshdeepItem.snapshot.subjects.map((s) =>
        s.code === 'CSE101' ? { ...s, marks: 92 } : s
      );
      await supabase
        .from('results')
        .update({ subjects_json: tamperedSubjects })
        .eq('id', arshdeepItem.resultId);
    }
  }

  return {
    seeded: true,
    message:
      'Institutional academic registry initialized: 8 B.Tech CSE Semester-1 student records (REG-2026-CSE-001..008) with signed Merkle proofs.',
  };
}

if (process.argv[1]?.endsWith('seedDemoData.ts')) {
  ensureDemoDataSeeded({ forceReset: true })
    .then(async (res) => {
      console.log(res.message);
      const sb = getSupabaseAdmin();
      const { data: rows } = await sb.from('results').select('id');
      for (const r of rows || []) {
        const rep = await verifySingleResultFromDb(r.id);
        console.log(
          `[Verify] ${rep.student.roll_number} (${rep.student.full_name}) => Status: ${rep.verification_status} | Pending Approvals: ${rep.pending_corrections.length} | Tampered Fields: ${
            rep.tampered_fields
              .map((f) => `${f.subject_code}(Signed:${f.verified_snapshot_marks}->DB:${f.current_db_marks})`)
              .join(',') || 'none'
          }`
        );
      }
      process.exit(res.seeded ? 0 : 1);
    })
    .catch((err) => {
      console.error('Seed error:', err);
      process.exit(1);
    });
}
