import { GoogleGenAI } from '@google/genai';
import { db } from './store';

export function getGeminiModel(): string {
  try {
    const cfgModel = db.get().integrationConfig?.geminiModel?.trim();
    if (cfgModel) return cfgModel;
  } catch {
    // Store not yet initialized
  }
  return process.env.GEMINI_MODEL?.trim() || 'gemini-2.5-flash';
}

export function getConfiguredGeminiApiKey(): string {
  try {
    const cfgKey = db.get().integrationConfig?.geminiApiKey?.trim();
    if (cfgKey && cfgKey !== 'MY_GEMINI_API_KEY') return cfgKey;
  } catch {
    // Store not yet initialized
  }
  const envKey = process.env.GEMINI_API_KEY?.trim() || '';
  return envKey !== 'MY_GEMINI_API_KEY' ? envKey : '';
}

export function getGeminiClient(): GoogleGenAI {
  const apiKey = getConfiguredGeminiApiKey();
  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY is not configured. Configure it in Server Dev Studio -> Integrations & API Keys or Settings > Secrets.'
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}
