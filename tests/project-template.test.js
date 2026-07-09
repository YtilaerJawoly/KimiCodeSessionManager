import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { validateProjectName, createProject, previewProject, SKELETON_FILES } from '../src/project-template.js';

describe('project-template', () => {
  describe('validateProjectName', () => {
    it('accepts valid names', () => {
      assert.equal(validateProjectName('my-project').valid, true);
      assert.equal(validateProjectName('my_project').valid, true);
      assert.equal(validateProjectName('project123').valid, true);
    });

    it('rejects empty names', () => {
      assert.equal(validateProjectName('').valid, false);
      assert.equal(validateProjectName('   ').valid, false);
    });

    it('rejects names with invalid path characters', () => {
      for (const char of ['\\', '/', ':', '*', '?', '"', '<', '>', '|']) {
        const result = validateProjectName(`bad${char}name`);
        assert.equal(result.valid, false);
        assert.equal(result.reason, 'invalidChars');
      }
    });

    it('rejects reserved names', () => {
      assert.equal(validateProjectName('.').valid, false);
      assert.equal(validateProjectName('..').valid, false);
    });
  });

  describe('createProject', () => {
    let base;

    beforeEach(() => {
      base = mkdtempSync(join(tmpdir(), 'ksm-pt-'));
    });

    afterEach(() => rmSync(base, { recursive: true, force: true }));

    it('creates project skeleton', () => {
      const { projectPath, projectName } = createProject('hello-world', base);
      assert.equal(projectName, 'hello-world');
      assert.equal(projectPath, join(base, 'hello-world'));

      const pkg = JSON.parse(readFileSync(join(projectPath, 'package.json'), 'utf8'));
      assert.equal(pkg.name, 'hello-world');
      assert.equal(pkg.type, 'module');
      assert.equal(pkg.main, 'src/index.js');

      assert.ok(readFileSync(join(projectPath, 'README.md'), 'utf8').includes('# hello-world'));
      assert.ok(readFileSync(join(projectPath, 'src', 'index.js'), 'utf8').includes("Hello from hello-world!"));
      assert.ok(readFileSync(join(projectPath, '.gitignore'), 'utf8').includes('node_modules/'));
    });

    it('throws on invalid name', () => {
      assert.throws(() => createProject('bad/name', base), /invalidChars/);
    });

    it('throws when project already exists', () => {
      createProject('duplicate', base);
      assert.throws(() => createProject('duplicate', base), /exists/);
    });

    it('previewProject returns path and skeleton file list', () => {
      const preview = previewProject('hello-world', base);
      assert.equal(preview.projectPath, join(base, 'hello-world'));
      assert.deepEqual(preview.files, SKELETON_FILES);
    });

    it('previewProject throws on invalid name', () => {
      assert.throws(() => previewProject('bad/name', base), /invalidChars/);
    });
  });
});
