# Firestore Security Specification

## 1. Data Invariants
1. **Student Isolation**: All student documents (`users/{userId}`, `quizAttempts`, `studyDecks`, `studyNotes`) strictly belong to `request.auth.uid`. No user can read, list, create, or modify any other student's data.
2. **Identity Integrity**: `incoming().uid == request.auth.uid` on profile creation/update. The `userId` in sub-collections must match both the URL path variable `{userId}` and `request.auth.uid`.
3. **No Blanket Access**: `allow list` explicitly validates that the path `{userId}` matches `request.auth.uid`.
4. **Valid Path Variables**: `isValidId(userId)` ensures no injection of junk-character IDs or excessive strings.
5. **Payload Strictness**: Input boundaries, types, and allowed field keys are strictly enforced on creation and update.

## 2. The "Dirty Dozen" Threat Payloads
1. **Payload 1 (Impersonation Write)**: An unauthenticated client attempts to create a user profile at `/users/student123`. Must return `PERMISSION_DENIED`.
2. **Payload 2 (Cross-User Read)**: User A (`auth.uid: 'studentA'`) attempts to `get` `/users/studentB`. Must return `PERMISSION_DENIED`.
3. **Payload 3 (Cross-User List)**: User A attempts to `list` `/users/studentB/quizAttempts`. Must return `PERMISSION_DENIED`.
4. **Payload 4 (Owner Spoofing on Create)**: User A creates a note at `/users/studentA/studyNotes/n1` with payload `{ userId: 'studentB' }`. Must return `PERMISSION_DENIED`.
5. **Payload 5 (Path Traversal ID)**: Writing to `/users/../../system_config` with arbitrary payload. Must return `PERMISSION_DENIED`.
6. **Payload 6 (Shadow Field Injection)**: User A creates a profile with an unauthorized field `{ isAdmin: true, role: 'superadmin' }`. Must return `PERMISSION_DENIED`.
7. **Payload 7 (Oversized Payload / Denial of Wallet)**: User A attempts to write a 2MB string into `studyNotes/{noteId}`. Must return `PERMISSION_DENIED`.
8. **Payload 8 (Negative Quiz Score)**: User writes quiz attempt with `{ score: -10 }`. Must return `PERMISSION_DENIED`.
9. **Payload 9 (Score Exceeding Total)**: User writes quiz attempt with `{ score: 50, totalQuestions: 4 }`. Must return `PERMISSION_DENIED`.
10. **Payload 10 (Immutable ID Mutation)**: User attempts to update `id` or `userId` in an existing `quizAttempt`. Must return `PERMISSION_DENIED`.
11. **Payload 11 (Unverified Email Write)**: Attacker with unverified email attempts to mutate study data. Must return `PERMISSION_DENIED`.
12. **Payload 12 (Foreign Deck Subcollection Hijacking)**: User A attempts to write a card deck under User B's subcollection. Must return `PERMISSION_DENIED`.
