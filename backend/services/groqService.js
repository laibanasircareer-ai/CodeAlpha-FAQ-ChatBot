/**
 * groqService.js
 * -----------------------------------------------------------------------
 * Thin wrapper around the Groq Chat Completions API. Single responsibility:
 * take a system prompt + message history, return the model's answer text.
 * Retrieval, prompt construction, and citation formatting all live
 * elsewhere (ragPipeline.js) — this file only knows how to talk to Groq.
 * -----------------------------------------------------------------------
 */

const Groq = require('groq-sdk');
const config = require('../utils/config');

let client = null;
function getClient() {
  if (!config.groq.apiKey) {
    throw new Error(
      'GROQ_API_KEY is not set. Add it to your .env file (see .env.example).'
    );
  }
  if (!client) {
    client = new Groq({ apiKey: config.groq.apiKey });
  }
  return client;
}

const SYSTEM_PROMPT = `You are the CODE Pakistan Policy Assistant.

Answer ONLY using the provided policy context below. Do not use outside knowledge, do not guess, and do not fill gaps with general IT/HR knowledge.

If the answer is not contained in the context, reply EXACTLY with this sentence and nothing else:
"I couldn't find that information in the provided CODE Pakistan policy documents."

Be concise, professional, and accurate. When you do answer from the context, write in clear plain English suitable for an internal enterprise assistant. Do not mention "the context" or "the documents" explicitly in your answer — just answer naturally, as a knowledgeable colleague would.`;

/**
 * Sends a request to Groq and returns the assistant's reply text.
 *
 * @param {Object} params
 * @param {string} params.contextText - Concatenated retrieved chunks (or empty string).
 * @param {Array<{role: 'user'|'assistant', content: string}>} params.history - Prior turns for memory.
 * @param {string} params.question - The current user question.
 * @returns {Promise<string>}
 */
async function generateAnswer({ contextText, history, question }) {
  const groq = getClient();

  const contextBlock = contextText
    ? `--- POLICY CONTEXT ---\n${contextText}\n--- END CONTEXT ---`
    : '--- POLICY CONTEXT ---\n(No relevant context was found for this question.)\n--- END CONTEXT ---';

  const messages = [
    { role: 'system', content: `${SYSTEM_PROMPT}\n\n${contextBlock}` },
    ...history,
    { role: 'user', content: question },
  ];

  try {
    const completion = await groq.chat.completions.create({
      model: config.groq.model,
      messages,
      temperature: config.groq.temperature,
      max_tokens: config.groq.maxTokens,
    });

    return completion.choices[0]?.message?.content?.trim() || config.fallbackAnswer;
  } catch (err) {
    console.error('[groqService] Groq API error:', err.message);
    throw new Error('The AI service is temporarily unavailable. Please try again shortly.');
  }
}

module.exports = { generateAnswer };
