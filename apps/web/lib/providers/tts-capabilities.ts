/**
 * Map of TTS provider capabilities such as accent support, voice selection, and speed control.
 * TTS 提供者能力映射表，包含口音支持、语音选择和语速控制等能力。
 */
export { ttsProviderCapabilities, supportsAccent } from '@meteorvoice/shared'

/**
 * Union type of supported TTS provider keys (e.g. "azure", "xunfei", "tencent", "volcengine").
 * 支持的 TTS 提供者键的联合类型（例如 "azure"、"xunfei"、"tencent"、"volcengine"）。
 */
export type { TTSProviderKey } from '@meteorvoice/shared'
