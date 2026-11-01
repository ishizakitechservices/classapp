import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

describe('Firestore Security Rules Specification & Verification', () => {
  const mockRules = {
    isValidId: (id: unknown) => typeof id === 'string' && id.length > 0 && id.length <= 128 && /^[a-zA-Z0-9_\-]+$/.test(id),
    isOwner: (authUid: string | null, userId: string) => authUid !== null && authUid === userId,
    isValidUserProfile: (data: any, uid: string) => {
      if (!data || typeof data !== 'object') return false;
      const allowedKeys = new Set(['uid', 'email', 'name', 'schoolLevel', 'targetExam', 'createdAt', 'updatedAt']);
      const requiredKeys = ['uid', 'email', 'name'];
      for (const k of requiredKeys) {
        if (!(k in data)) return false;
      }
      for (const k of Object.keys(data)) {
        if (!allowedKeys.has(k)) return false;
      }
      return data.uid === uid && typeof data.email === 'string' && typeof data.name === 'string';
    },
    isValidQuizAttempt: (data: any, uid: string) => {
      if (!data || typeof data !== 'object') return false;
      const allowedKeys = new Set(['id', 'userId', 'quizTitle', 'subjectCode', 'score', 'totalQuestions', 'percentage', 'timestamp']);
      const requiredKeys = ['id', 'userId', 'quizTitle', 'score', 'totalQuestions', 'percentage', 'timestamp'];
      for (const k of requiredKeys) {
        if (!(k in data)) return false;
      }
      for (const k of Object.keys(data)) {
        if (!allowedKeys.has(k)) return false;
      }
      return (
        data.userId === uid &&
        typeof data.score === 'number' &&
        data.score >= 0 &&
        data.score <= data.totalQuestions &&
        data.percentage >= 0 &&
        data.percentage <= 100
      );
    },
  };

  test('Payload 1: Unauthenticated request must be denied', () => {
    assert.strictEqual(mockRules.isOwner(null, 'student123'), false);
  });

  test('Payload 2: Cross-user access must be denied', () => {
    assert.strictEqual(mockRules.isOwner('studentA', 'studentB'), false);
  });

  test('Payload 3: Valid owner access must be allowed', () => {
    assert.strictEqual(mockRules.isOwner('studentA', 'studentA'), true);
  });

  test('Payload 4: Invalid path variable with traversal characters must be rejected', () => {
    assert.strictEqual(mockRules.isValidId('../../admin_config'), false);
    assert.strictEqual(mockRules.isValidId('valid-student_123'), true);
  });

  test('Payload 6: Shadow fields injection (isAdmin: true) must be rejected', () => {
    const malicious = {
      uid: 'studentA',
      email: 'student@example.com',
      name: 'Student A',
      isAdmin: true, // Ghost field
    };
    assert.strictEqual(mockRules.isValidUserProfile(malicious, 'studentA'), false);
  });

  test('Payload 8: Negative quiz score must be rejected', () => {
    const invalidQuiz = {
      id: 'q1',
      userId: 'studentA',
      quizTitle: 'Physics Vectors',
      score: -5,
      totalQuestions: 10,
      percentage: -50,
      timestamp: '2026-04-12T10:00:00Z',
    };
    assert.strictEqual(mockRules.isValidQuizAttempt(invalidQuiz, 'studentA'), false);
  });

  test('Payload 9: Score exceeding total questions must be rejected', () => {
    const invalidQuiz = {
      id: 'q2',
      userId: 'studentA',
      quizTitle: 'Chemistry Mole Concept',
      score: 15,
      totalQuestions: 10,
      percentage: 150,
      timestamp: '2026-04-12T10:00:00Z',
    };
    assert.strictEqual(mockRules.isValidQuizAttempt(invalidQuiz, 'studentA'), false);
  });

  test('Valid quiz attempt conforming to schema must be accepted', () => {
    const validQuiz = {
      id: 'q3',
      userId: 'studentA',
      quizTitle: 'Biology Cell Division',
      score: 8,
      totalQuestions: 10,
      percentage: 80,
      timestamp: '2026-04-12T10:00:00Z',
    };
    assert.strictEqual(mockRules.isValidQuizAttempt(validQuiz, 'studentA'), true);
  });
});
