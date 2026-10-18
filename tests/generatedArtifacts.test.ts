import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createArtifactPreview, extractGeneratedArtifacts, stripGeneratedCodeBlocks } from '../lib/artifacts/generatedArtifacts.js';

test('extracts named web, data, and document artifacts including an in-progress code fence', () => {
  const artifacts = extractGeneratedArtifacts([
    'Here are the files:',
    '```html index.html',
    '<main>Hello</main>',
    '```',
    '```css filename="styles.css"',
    'main { color: blue; }',
    '```',
    '```json',
    '{"ready":true}',
    '```',
    '```md README.md',
    '# Notes',
    '```',
    '```javascript',
    'console.log("live")',
  ].join('\n'));

  assert.deepEqual(artifacts.map(({ filename, kind }) => ({ filename, kind })), [
    { filename: 'index.html', kind: 'html' },
    { filename: 'styles.css', kind: 'css' },
    { filename: 'data.json', kind: 'json' },
    { filename: 'README.md', kind: 'markdown' },
    { filename: 'script.js', kind: 'javascript' },
  ]);
});

test('builds a restricted live preview by composing HTML, CSS, and JavaScript artifacts', () => {
  const artifacts = extractGeneratedArtifacts([
    '```html',
    '<!doctype html><html><head></head><body><main id="app"></main></body></html>',
    '```',
    '```css',
    '#app { color: purple; }',
    '```',
    '```js',
    'document.querySelector("#app").textContent = "Cintra";',
    '```',
  ].join('\n'));

  const preview = createArtifactPreview(artifacts, artifacts[0]);
  assert.match(preview, /Content-Security-Policy/);
  assert.match(preview, /connect-src 'none'/);
  assert.match(preview, /#app \{ color: purple; \}/);
  assert.match(preview, /textContent = "Cintra"/);
});

test('places its content policy inside a head even when generated HTML has no head element', () => {
  const [html] = extractGeneratedArtifacts('```html\n<html><body><h1>Preview</h1></body></html>\n```');
  assert.ok(html);
  const preview = createArtifactPreview([html], html);
  assert.match(preview, /<head><meta http-equiv="Content-Security-Policy"/);
});

test('extracts general-purpose language fences for the editor and strips their contents from chat', () => {
  const message = [
    'Here is a short explanation.',
    '```python app.py',
    'print("hello")',
    '```',
    '```rust',
    'fn main() {}',
    '```',
  ].join('\n');

  const artifacts = extractGeneratedArtifacts(message);
  assert.deepEqual(artifacts.map(({ filename, kind, language }) => ({ filename, kind, language })), [
    { filename: 'app.py', kind: 'code', language: 'python' },
    { filename: 'code-2.rust', kind: 'code', language: 'rust' },
  ]);
  assert.equal(stripGeneratedCodeBlocks(message), 'Here is a short explanation.');
  assert.equal(stripGeneratedCodeBlocks('```python\nprint("in progress")\nprint("still hidden")'), '');
});
