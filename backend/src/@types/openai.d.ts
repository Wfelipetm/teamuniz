export interface IOpenAi {
    name: string;
    prompt: string;
    voice: string;
    voiceKey: string;
    voiceRegion: string;
    maxTokens: string;
    temperature: string;
    apiKey: string;
    queueId: string;
    maxMessages: string;
    model?: string; // Modelo da OpenAI (gpt-4o, gpt-4o-mini, gpt-3.5-turbo, etc)
};