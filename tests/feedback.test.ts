import assert from "node:assert/strict";
import { test } from "node:test";
import { buildSystemInstruction, isChatTurns, isConversationId } from "../server/feedback.ts";

test("validates UUID conversation IDs", () => {
  assert.equal(isConversationId("550e8400-e29b-41d4-a716-446655440000"), true);
  assert.equal(isConversationId("../data/rl-chat.db"), false);
  assert.equal(isConversationId(""), false);
});

test("rejects invalid chat turns and malformed final roles", () => {
  assert.equal(isChatTurns([{ role: "user", content: "Hello" }]), true);
  assert.equal(isChatTurns([{ role: "model", content: "Hello" }]), false);
  assert.equal(isChatTurns([{ role: "user", content: "" }]), false);
  assert.equal(isChatTurns([{ role: "admin", content: "Hello" }]), false);
  assert.equal(isChatTurns(Array.from({ length: 31 }, () => ({ role: "user", content: "x" }))), false);
});

test("limits and labels feedback examples as untrusted", () => {
  const instruction = buildSystemInstruction([{ prompt: "p".repeat(1200), response: "r".repeat(1600) }]);
  assert.match(instruction, /reference text only/);
  assert.match(instruction, /previously positively rated examples/);
  assert.equal(instruction.includes("p".repeat(1100)), false);
});
