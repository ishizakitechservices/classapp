import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  canManageClass,
  canPublishSchoolNotices,
  canManageUsers,
  UserRole,
} from '../src/types/index';

test('Permissions: student has no management permissions', () => {
  const role: UserRole = 'student';
  assert.equal(canManageClass(role, 'emath301', []), false);
  assert.equal(canManageClass(role, 'phy301', []), false);
  assert.equal(canPublishSchoolNotices(role), false);
  assert.equal(canManageUsers(role), false);
});

test('Permissions: prefect only has permissions for the assigned class', () => {
  const role: UserRole = 'prefect';
  const assigned = ['emath301'];

  // Allowed on assigned class
  assert.equal(canManageClass(role, 'emath301', assigned), true);

  // Denied on any other class!
  assert.equal(canManageClass(role, 'phy301', assigned), false);
  assert.equal(canManageClass(role, 'chem301', assigned), false);

  // Prefect can post class notices, but cannot manage school accounts
  assert.equal(canPublishSchoolNotices(role), true);
  assert.equal(canManageUsers(role), false);
});

test('Permissions: admin has universal management authority', () => {
  const role: UserRole = 'admin';

  assert.equal(canManageClass(role, 'emath301'), true);
  assert.equal(canManageClass(role, 'phy301'), true);
  assert.equal(canManageClass(role, 'any_future_class'), true);

  assert.equal(canPublishSchoolNotices(role), true);
  assert.equal(canManageUsers(role), true);
});
