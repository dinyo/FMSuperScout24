'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./harness');
const app = loadApp();

test('unemployed Dylan Rousselle displays his preferred role throughout staff views', () => {
  const staff = { name: 'Dylan Rousselle', staffAttrs: {}, preferredJobId: 64,
    jobInterests: { 'Head of Youth Development': 20, Coach: 15, 'Assistant Coach': 13, 'Head Coach': 11 } };
  assert.equal(app.jobLabel(staff), 'Head of youth development');
  assert.equal(app.staffRoleKey(staff), app.preferredJobLabel(staff));
  assert.equal(app.currentJobLabel(staff), '');
  const html = app.staffJobInterestsHtml(staff);
  assert.match(html, /Head of Youth Development<\/td><td[^>]*>20\/20/);
  assert.ok(html.indexOf('Head of Youth Development') < html.indexOf('Coach'));
});

test('analytical preferences have labels and remain separate from current contracts', () => {
  for (const [id, label] of [[58, 'Performance analyst'], [60, 'Head performance analyst'], [62, 'Recruitment analyst']]) {
    const staff = { staffAttrs: {}, preferredJobId: id, jobId: 2 };
    assert.equal(app.jobLabel(staff), label);
    assert.equal(app.currentJobLabel(staff), 'Coach');
  }
});

test('job interests reject invalid scores and escape role names', () => {
  assert.equal(app.staffJobInterestsHtml({}), '');
  const html = app.staffJobInterestsHtml({jobInterests: { '<script>': 20, invalid: 255, missing: null }});
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>|invalid|missing/);
});
