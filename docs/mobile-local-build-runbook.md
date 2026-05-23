# Mobile Local Build Runbook

本文档记录 MeteorVoice native mobile app 的本地运行方式。当前目标是本机可验证，不依赖 TestFlight、App Store 或 EAS 云构建。

## 前置条件

- Node.js 20+。
- Xcode 最新稳定版和已安装的 iOS Simulator。
- CocoaPods 可用；Expo `run:ios` 会在需要时执行原生依赖安装。
- 仓库根目录执行过 `npm install`。
- Web/API 服务可访问；本机调试推荐同时运行 `npm run dev`。

## 环境变量

在启动 mobile 前设置：

```bash
export EXPO_PUBLIC_API_BASE_URL=http://localhost:3000
export EXPO_PUBLIC_SUPABASE_URL=...
export EXPO_PUBLIC_SUPABASE_ANON_KEY=...
```

真机访问本机 Web/API 时，`localhost` 指向手机自身，通常需要改成 Mac 的局域网 IP，例如：

```bash
export EXPO_PUBLIC_API_BASE_URL=http://192.168.1.20:3000
```

不要把 Supabase service role key、TTS provider secret 或任何 server secret 放进 `EXPO_PUBLIC_*`。

## Expo Go

Expo Go 可用于快速查看普通 React Native UI 和部分 JS 逻辑：

```bash
cd apps/mobile
npx expo start
```

限制：

- 不适合作为最终 native audio 验收。
- 无法覆盖所有 config plugin、权限文案、原生工程配置和 development build 行为。
- 无法作为 `expo-speech-recognition` 的最终验收环境；native speech recognition 需要 development build。
- 国内网络下 tunnel 可能不稳定，优先使用 LAN 或 simulator。

## Native Speech Recognition

MeteorVoice mobile 当前使用 `expo-speech-recognition` 作为第一阶段 native STT 路径。

它封装的是平台原生能力：

- iOS: `SFSpeechRecognizer`
- Android: `SpeechRecognizer`
- Web: Web Speech API

这不是后端 STT 服务，也不会把 provider secret 放进 mobile app。它用于先打通低成本真机语音输入闭环：

```text
native speech transcript -> /api/chat -> /api/tts -> native playback
```

业务代码 MUST 通过 `apps/mobile/src/nativeSpeech.ts` 这个 MeteorVoice adapter 使用它，不要在 UI 里直接调用第三方模块。这样后续如果需要替换成自研 Expo native module 或后端 STT fallback，只需要换 adapter。

局限：

- 必须使用 development build，例如 `npx expo run:ios` 或 `npx expo run:android`。
- iOS/Android 的识别能力、离线支持、语言切换和错误码会受系统版本与设备设置影响。
- 中文夹杂英文能否保留为中文，取决于系统 recognizer 的返回结果；如果返回了中文文本，MeteorVoice 的 AI 规则会进行口头解释和 vocabulary correction。

## iOS Simulator Development Build

推荐验证路径：

```bash
cd apps/mobile
npx expo run:ios
```

这会生成/更新 iOS 原生工程并安装到 simulator。适合验证：

- React Native bundle 是否启动。
- API base URL 是否可访问。
- Supabase 登录/session token 是否可用。
- TTS playback 是否能播放。
- 录音权限弹窗和 denied/granted 状态。
- Native speech recognition 权限弹窗、partial/final transcript 和 speech -> chat -> TTS 闭环。

如果原生依赖或配置变化较大，可先执行：

```bash
cd apps/mobile
npx expo prebuild --clean
npx expo run:ios
```

`prebuild --clean` 会重建 `ios/`、`android/` 原生目录；执行前确认没有需要保留的原生手改。

## iOS 真机本地调试

不走 TestFlight 时，真机调试仍可用 Xcode + 免费 Apple ID，但有限制：

- 需要在 Xcode 登录 Apple ID。
- Bundle identifier 需要可签名。
- 免费账号签名有效期和设备能力有限，不适合作为长期分发。
- 真机需要和 Mac 在同一网络，API base URL 使用 Mac 局域网 IP。

推荐流程：

```bash
cd apps/mobile
npx expo run:ios --device
```

如果命令行签名失败，用 Xcode 打开生成的 `apps/mobile/ios` 工程，选择 Team 后运行。

## Android 本地调试

当前首要验证 iOS native audio。Android 可按 Expo 标准流程运行：

```bash
cd apps/mobile
npx expo run:android
```

Android 真机同样需要把 API base URL 改成 Mac 局域网 IP。

## 国内网络建议

- 优先使用本地 `run:ios` / `run:android`，减少 EAS 和 tunnel 依赖。
- npm registry、CocoaPods specs、Gradle 下载可按本机网络环境配置镜像。
- 如果 Expo CLI 需要联网但失败，先确认本地 simulator build 是否可以通过 Xcode 直接运行。

## 验证清单

1. `npm run lint`
2. `npm test`
3. `cd apps/mobile && npx expo config --type public`
4. `cd apps/mobile && npx expo run:ios`
5. 按 `docs/mobile-audio-qa-checklist.md` 执行 native audio QA。
6. 使用 `Speak instead` 完成一次 native speech turn；Expo Go 不能作为最终验收，必须使用 development build。

## 常见问题

- iOS 真机听不到声音：确认系统音量、静音开关、蓝牙输出、API 返回的 `audioUrl` 是否可访问。
- 手机访问不了 API：不要用 `localhost`，改用 Mac 局域网 IP，并确认防火墙允许访问。
- 登录后 API 仍 401：确认 Supabase env 已设置，mobile 使用的是 anon key，server API 支持 bearer token。
- Native speech 不可用：确认运行的是 `expo run:ios` / `expo run:android` 生成的 development build，不是 Expo Go；同时确认 speech recognition 和 microphone 权限已允许。
- `expo prebuild --clean` 后原生目录变化很多：这是预期行为，但当前阶段不需要提交生成的 `ios/`、`android/` 目录，除非后续阶段明确切换到 committed native projects。
