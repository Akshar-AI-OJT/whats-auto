export enum LlmChatProvider {
  Openai = 'openai',
  Google = 'google',
  Mistral = 'mistral',
}

export const LLM_CHAT_PROVIDERS = Object.values(LlmChatProvider)

export const LLM_PROVIDER_API_KEY_ENV: Record<LlmChatProvider, string> = {
  [LlmChatProvider.Openai]: 'OPENAI_API_KEY',
  [LlmChatProvider.Google]: 'GOOGLE_AI_API_KEY',
  [LlmChatProvider.Mistral]: 'MISTRAL_API_KEY',
}
