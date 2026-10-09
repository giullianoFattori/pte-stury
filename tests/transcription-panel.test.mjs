import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// TSX loader for the real component; no copied rendering implementation.
const hooks = registerHooks({
  resolve(specifier, context, next) {
    try { return next(specifier, context); }
    catch (error) {
      if (specifier.startsWith('.')) {
        for (const extension of ['.ts', '.tsx']) {
          try { return next(specifier + extension, context); } catch {}
        }
      }
      throw error;
    }
  },
  load(url, context, next) {
    if (url.endsWith('.ts') || url.endsWith('.tsx')) return {
      format: 'module', shortCircuit: true,
      source: ts.transpileModule(readFileSync(new URL(url), 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX },
      }).outputText,
    };
    return next(url, context);
  },
});
const { TranscriptionPanel } = await import('../src/shared/speech/components/TranscriptionPanel.tsx');
hooks.deregister();
const props = { status: 'idle', result: null, errorMessage: null, hasRecording: true, disabled: false,
  onLanguageChange() {}, async onCheck() {}, async onInstall() {}, async onTranscribe() {} };
function render(extra) { return renderToStaticMarkup(React.createElement(TranscriptionPanel, { ...props, ...extra })); }
test('native panel hides browser controls and provides runtime copy, retry and detected evidence', () => {
  for (const status of ['idle', 'ready', 'unavailable', 'error', 'success']) {
    const html = render({ status, result: { text: 'Test transcript.' } });
    assert.doesNotMatch(html, /<select|Install local speech pack|English \(Australia\)/);
    assert.match(html, /Audio is processed locally on this computer. No cloud fallback./);
  }
  assert.match(render({ status: 'ready' }), /Local Whisper transcription ready/);
  assert.match(render({ status: 'unavailable' }), /Start the PTE speech runtime and check again/);
  assert.match(render({ status: 'error' }), /Try transcription again/);
  assert.match(render({ status: 'success', result: { text: 'Test transcript.' } }), /Detected speech.*Test transcript/);
});
test('explicit browser provider preserves language selection and install controls', () => {
  const provider = { kind: 'browser-on-device', label: 'Browser', supportsLanguageInstall: true };
  assert.match(render({ provider }), /<select.*en-AU/);
  assert.match(render({ provider, status: 'needs-install' }), /Install local speech pack/);
});
