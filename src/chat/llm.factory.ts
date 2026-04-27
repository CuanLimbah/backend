import { ConfigService } from '@nestjs/config';
import { createMistral } from '@ai-sdk/mistral';
import { createOpenAI } from '@ai-sdk/openai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';

export type ProviderType = 'mistral' | 'openai' | 'gemini';

export function getLlmModel(config: ConfigService) {
  const provider = (config.get<string>('LLM_PROVIDER') || 'mistral').toLowerCase() as ProviderType;

  if (provider === 'openai') {
    const openai = createOpenAI({ apiKey: config.get('OPENAI_API_KEY')! });
    return openai('gpt-4o-mini');
  }

  if (provider === 'gemini') {
    const google = createGoogleGenerativeAI({ apiKey: config.get('GEMINI_API_KEY')! });
    return google('gemini-2.0-flash');
  }

  const mistral = createMistral({ apiKey: config.get('MISTRAL_API_KEY')! });
  return mistral('mistral-small-latest');
}

export function getEmbeddingModel(config: ConfigService) {
  const provider = (config.get<string>('EMBEDDING_PROVIDER') || 'mistral').toLowerCase() as ProviderType;

  if (provider === 'openai') {
    const openai = createOpenAI({ apiKey: config.get('OPENAI_API_KEY')! });
    return openai.textEmbeddingModel('text-embedding-3-small');
  }

  if (provider === 'gemini') {
    const google = createGoogleGenerativeAI({ apiKey: config.get('GEMINI_API_KEY')! });
    return google.textEmbeddingModel('text-embedding-004');
  }

  const mistral = createMistral({ apiKey: config.get('MISTRAL_API_KEY')! });
  return mistral.textEmbeddingModel('mistral-embed');
}
