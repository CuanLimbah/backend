import { ConfigService } from '@nestjs/config';
import { createMistral } from '@ai-sdk/mistral';
import { createOpenAI } from '@ai-sdk/openai';

export type ProviderType = 'mistral' | 'openai';

export function getLlmModel(config: ConfigService) {
  const provider = (config.get<string>('LLM_PROVIDER') || 'mistral').toLowerCase() as ProviderType;

  if (provider === 'openai') {
    const openai = createOpenAI({ apiKey: config.get('OPENAI_API_KEY')! });
    return openai('gpt-4o-mini');
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

  const mistral = createMistral({ apiKey: config.get('MISTRAL_API_KEY')! });
  return mistral.textEmbeddingModel('mistral-embed');
}
