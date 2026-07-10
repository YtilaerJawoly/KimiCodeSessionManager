import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { getWelcomeWidth, WELCOME_WIDTH, MIN_WELCOME_WIDTH } from '../src/tui/helpers.js';

describe('getWelcomeWidth', () => {
  let originalColumns;

  beforeEach(() => {
    originalColumns = process.stdout.columns;
  });

  afterEach(() => {
    process.stdout.columns = originalColumns;
  });

  it('returns default width when columns is undefined', () => {
    process.stdout.columns = undefined;
    assert.equal(getWelcomeWidth(), WELCOME_WIDTH);
  });

  it('caps at default width when terminal is wider', () => {
    process.stdout.columns = 200;
    assert.equal(getWelcomeWidth(), WELCOME_WIDTH);
  });

  it('uses terminal width when between min and default', () => {
    process.stdout.columns = 60;
    assert.equal(getWelcomeWidth(), 60);
  });

  it('returns min width when terminal is too narrow', () => {
    process.stdout.columns = 20;
    assert.equal(getWelcomeWidth(), MIN_WELCOME_WIDTH);
  });
});
