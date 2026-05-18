export interface STTResult {
  transcript: string
  confidence: number
}

export interface TTSResult {
  audioUrl: string
  duration: number
}

export interface ConversationMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export interface ConversationResponse {
  text: string
  corrections: {
    type: 'grammar' | 'vocabulary' | 'fluency' | 'pronunciation'
    originalText: string
    suggestedText: string
    explanation: string
    severity: 'minor' | 'moderate' | 'major'
  }[]
  suggestedReply: string
}

export interface STTProvider {
  transcribe(audioBlob: Blob): Promise<STTResult>
}

export interface TTSProvider {
  synthesize(text: string, options?: { accent?: string; speed?: number }): Promise<TTSResult>
}

export interface AIProvider {
  generateReply(messages: ConversationMessage[], context: ConversationContext): Promise<ConversationResponse>
}

export interface ConversationContext {
  scenario: { name: string; description: string }
  accentProfile: { name: string; region: string }
  sessionId: string
  turnNumber: number
}
