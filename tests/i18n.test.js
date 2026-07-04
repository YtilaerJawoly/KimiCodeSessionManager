import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { setLocale, getLocale, t, listLocales } from '../src/i18n.js';

describe('i18n', () => {
  it('lists supported locales', () => {
    const locales = listLocales();
    assert.ok(locales.includes('zh-CN'));
    assert.ok(locales.includes('en'));
  });

  it('defaults to zh-CN', () => {
    setLocale('zh-CN');
    assert.equal(getLocale(), 'zh-CN');
  });

  it('returns Chinese text for zh-CN locale', () => {
    setLocale('zh-CN');
    assert.equal(t('mainMenu.title'), '主菜单：');
  });

  it('returns English text for en locale', () => {
    setLocale('en');
    assert.equal(t('mainMenu.title'), 'Main Menu:');
  });

  it('replaces placeholders', () => {
    setLocale('zh-CN');
    assert.equal(t('welcome.title', { version: '0.1.0' }), 'Kimi Code Session Manager 0.1.0');
  });

  it('falls back to zh-CN key when translation is missing in en', () => {
    setLocale('en');
    assert.equal(t('mainMenu.kimiCodeUpdate', { version: '0.22.3' }), 'Kimi Code update available: 0.22.3');
  });

  it('falls back to key itself when translation is not found', () => {
    setLocale('en');
    assert.equal(t('non.existent.key'), 'non.existent.key');
  });

  it('ignores invalid locale and keeps current locale', () => {
    setLocale('en');
    setLocale('fr');
    assert.equal(getLocale(), 'en');
  });
});
