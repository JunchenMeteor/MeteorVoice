import AVFoundation
import ExpoModulesCore

public class VoiceAudioSessionModule: Module {
  public func definition() -> ModuleDefinition {
    Name("VoiceAudioSession")

    AsyncFunction("configure") { (options: [String: Any]) -> [String: Any] in
      let mode = options["mode"] as? String ?? "default"
      let allowBluetooth = options["allowBluetooth"] as? Bool ?? true
      let defaultToSpeaker = options["defaultToSpeaker"] as? Bool ?? true
      let mixWithOthers = options["mixWithOthers"] as? Bool ?? false
      let session = AVAudioSession.sharedInstance()

      switch mode {
      case "playback", "default":
        try self.configurePlaybackSession(session, mixWithOthers: mixWithOthers)
      case "recording":
        try self.configurePlayAndRecordSession(
          session,
          mode: .default,
          allowBluetooth: allowBluetooth,
          defaultToSpeaker: defaultToSpeaker,
          mixWithOthers: mixWithOthers
        )
      case "voiceChat":
        try self.configurePlayAndRecordSession(
          session,
          mode: .voiceChat,
          allowBluetooth: allowBluetooth,
          defaultToSpeaker: defaultToSpeaker,
          mixWithOthers: mixWithOthers
        )
      default:
        throw NSError(
          domain: "VoiceAudioSession",
          code: 1,
          userInfo: [NSLocalizedDescriptionKey: "Unsupported audio session mode: \(mode)"]
        )
      }

      return [
        "ok": true,
        "platform": "ios",
        "appliedMode": mode,
        "category": session.category.rawValue,
        "sessionMode": session.mode.rawValue,
        "route": self.currentRoute(session),
      ]
    }
  }

  private func configurePlaybackSession(
    _ session: AVAudioSession,
    mixWithOthers: Bool
  ) throws {
    let options: AVAudioSession.CategoryOptions = mixWithOthers ? [.mixWithOthers] : []
    try session.setCategory(.playback, mode: .default, options: options)
    try session.setActive(true)
  }

  private func configurePlayAndRecordSession(
    _ session: AVAudioSession,
    mode: AVAudioSession.Mode,
    allowBluetooth: Bool,
    defaultToSpeaker: Bool,
    mixWithOthers: Bool
  ) throws {
    var options: AVAudioSession.CategoryOptions = []
    if allowBluetooth {
      options.insert(.allowBluetoothHFP)
      options.insert(.allowBluetoothA2DP)
    }
    if defaultToSpeaker {
      options.insert(.defaultToSpeaker)
    }
    if mixWithOthers {
      options.insert(.mixWithOthers)
    }

    try session.setCategory(.playAndRecord, mode: mode, options: options)
    try session.setActive(true)
    try session.overrideOutputAudioPort(defaultToSpeaker ? .speaker : .none)
  }

  private func currentRoute(_ session: AVAudioSession) -> [String: Any] {
    return [
      "inputs": session.currentRoute.inputs.map { port in
        ["portType": port.portType.rawValue, "portName": port.portName]
      },
      "outputs": session.currentRoute.outputs.map { port in
        ["portType": port.portType.rawValue, "portName": port.portName]
      },
    ]
  }
}
