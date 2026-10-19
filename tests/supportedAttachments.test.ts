import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CHAT_ATTACHMENT_ACCEPT,
  CHAT_ATTACHMENT_FORMATS,
  isSupportedChatAttachmentExtension,
} from '../lib/chat/supportedAttachments.js';

test('keeps the advertised upload formats aligned with the chat file picker', () => {
  const advertisedExtensions = CHAT_ATTACHMENT_FORMATS.flatMap(({ extensions }) => extensions);
  assert.deepEqual(CHAT_ATTACHMENT_ACCEPT.split(','), advertisedExtensions);
  assert.ok(advertisedExtensions.every(isSupportedChatAttachmentExtension));
  assert.equal(isSupportedChatAttachmentExtension('.docx'), true);
  assert.equal(isSupportedChatAttachmentExtension('.xlsx'), true);
  assert.equal(isSupportedChatAttachmentExtension('.pptx'), true);
  assert.equal(isSupportedChatAttachmentExtension('.doc'), false);
});

test('validates attachment extensions case-insensitively without accepting partial matches', () => {
  assert.equal(isSupportedChatAttachmentExtension('.PDF'), true);
  assert.equal(isSupportedChatAttachmentExtension('.jpeg'), true);
  assert.equal(isSupportedChatAttachmentExtension('pdf'), false);
  assert.equal(isSupportedChatAttachmentExtension('.doc'), false);
});
