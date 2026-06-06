import AVFoundation
import ExpoModulesCore

public class VoicePcmCaptureModule: Module {
  private let captureQueue = DispatchQueue(label: "com.meteorvoice.voicePcmCapture")
  private var engine: AVAudioEngine?
  private var converter: AVAudioConverter?
  private var targetFormat: AVAudioFormat?
  private var pendingPcm = Data()
  private var isCapturing = false
  private var sequence = 0
  private var totalBytes = 0
  private var startedAtMs: Int64 = 0
  private var frameSizeBytes = 1280
  private var frameDurationMs = 40
  private var sampleRate = 16000.0
  private var routeChangeObserver: NSObjectProtocol?
  private var interruptionObserver: NSObjectProtocol?
  private var mediaServicesResetObserver: NSObjectProtocol?

  public func definition() -> ModuleDefinition {
    Name("VoicePcmCapture")

    Events("onPcmCaptureFrame", "onPcmCaptureState")

    AsyncFunction("start") { (options: [String: Any]) -> [String: Any] in
      try self.startCapture(options: options)
    }

    AsyncFunction("stop") { (reason: String?) -> [String: Any] in
      self.stopCapture(reason: reason ?? "manual")
    }

    AsyncFunction("getStatus") { () -> [String: Any] in
      self.currentStatus()
    }
  }

  private func startCapture(options: [String: Any]) throws -> [String: Any] {
    if isCapturing {
      return currentStatus()
    }

    sampleRate = options["sampleRate"] as? Double ?? 16000.0
    frameDurationMs = options["frameDurationMs"] as? Int ?? 40
    frameSizeBytes = Int(sampleRate * Double(frameDurationMs) / 1000.0) * 2

    try configureAudioSession()

    let nextEngine = AVAudioEngine()
    let inputFormat = nextEngine.inputNode.outputFormat(forBus: 0)
    guard let nextTargetFormat = AVAudioFormat(
      commonFormat: .pcmFormatInt16,
      sampleRate: sampleRate,
      channels: 1,
      interleaved: false
    ) else {
      throw NSError(
        domain: "VoicePcmCapture",
        code: 1,
        userInfo: [NSLocalizedDescriptionKey: "Failed to create target PCM format."]
      )
    }
    guard let nextConverter = AVAudioConverter(from: inputFormat, to: nextTargetFormat) else {
      throw NSError(
        domain: "VoicePcmCapture",
        code: 2,
        userInfo: [NSLocalizedDescriptionKey: "Failed to create PCM converter."]
      )
    }

    pendingPcm.removeAll(keepingCapacity: false)
    sequence = 0
    totalBytes = 0
    startedAtMs = nowMs()
    targetFormat = nextTargetFormat
    converter = nextConverter
    isCapturing = true

    do {
      try installAndStartEngine(nextEngine, inputFormat: inputFormat)
    } catch {
      isCapturing = false
      nextEngine.inputNode.removeTap(onBus: 0)
      engine = nil
      converter = nil
      targetFormat = nil
      throw error
    }

    installAudioSessionObservers()
    sendState("started", message: nil)
    return currentStatus()
  }

  private func stopCapture(reason: String) -> [String: Any] {
    if !isCapturing {
      return currentStatus(reason: reason)
    }

    isCapturing = false
    engine?.inputNode.removeTap(onBus: 0)
    engine?.stop()
    engine = nil
    converter = nil
    targetFormat = nil
    pendingPcm.removeAll(keepingCapacity: false)
    removeAudioSessionObservers()

    let status = currentStatus(reason: reason)
    sendState("stopped", message: reason)
    return status
  }

  private func configureAudioSession() throws {
    let session = AVAudioSession.sharedInstance()
    try session.setCategory(
      .playAndRecord,
      mode: .voiceChat,
      options: [.allowBluetoothHFP, .defaultToSpeaker]
    )
    try session.setActive(true)
    try session.overrideOutputAudioPort(.speaker)
  }

  private func installAndStartEngine(_ nextEngine: AVAudioEngine, inputFormat: AVAudioFormat) throws {
    let inputNode = nextEngine.inputNode
    let tapBufferSize = AVAudioFrameCount(max(1024, Int(inputFormat.sampleRate * 0.04)))
    inputNode.installTap(onBus: 0, bufferSize: tapBufferSize, format: inputFormat) { [weak self] buffer, _ in
      self?.captureQueue.async {
        self?.handleInputBuffer(buffer)
      }
    }
    nextEngine.prepare()
    try nextEngine.start()
    engine = nextEngine
  }

  private func restartCaptureEngine(reason: String) {
    guard isCapturing else {
      return
    }

    sendState("restarting", message: reason)
    engine?.inputNode.removeTap(onBus: 0)
    engine?.stop()
    engine = nil
    converter = nil
    targetFormat = nil
    pendingPcm.removeAll(keepingCapacity: false)

    do {
      try configureAudioSession()
      let nextEngine = AVAudioEngine()
      let inputFormat = nextEngine.inputNode.outputFormat(forBus: 0)
      guard let nextTargetFormat = AVAudioFormat(
        commonFormat: .pcmFormatInt16,
        sampleRate: sampleRate,
        channels: 1,
        interleaved: false
      ) else {
        throw NSError(
          domain: "VoicePcmCapture",
          code: 3,
          userInfo: [NSLocalizedDescriptionKey: "Failed to recreate target PCM format."]
        )
      }
      guard let nextConverter = AVAudioConverter(from: inputFormat, to: nextTargetFormat) else {
        throw NSError(
          domain: "VoicePcmCapture",
          code: 4,
          userInfo: [NSLocalizedDescriptionKey: "Failed to recreate PCM converter."]
        )
      }

      targetFormat = nextTargetFormat
      converter = nextConverter
      try installAndStartEngine(nextEngine, inputFormat: inputFormat)
      sendState("restarted", message: reason)
    } catch {
      isCapturing = false
      engine?.inputNode.removeTap(onBus: 0)
      engine?.stop()
      engine = nil
      converter = nil
      targetFormat = nil
      pendingPcm.removeAll(keepingCapacity: false)
      removeAudioSessionObservers()
      sendState("error", message: error.localizedDescription)
    }
  }

  private func installAudioSessionObservers() {
    removeAudioSessionObservers()
    let center = NotificationCenter.default
    routeChangeObserver = center.addObserver(
      forName: AVAudioSession.routeChangeNotification,
      object: AVAudioSession.sharedInstance(),
      queue: nil
    ) { [weak self] notification in
      let reasonValue = notification.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt
      let reason = AVAudioSession.RouteChangeReason(rawValue: reasonValue ?? 0)
      self?.captureQueue.async {
        if reason == .categoryChange {
          self?.sendState("route_change_ignored", message: "route_change:\(reasonValue ?? 0)")
          return
        }
        self?.restartCaptureEngine(reason: "route_change:\(reasonValue ?? 0)")
      }
    }
    interruptionObserver = center.addObserver(
      forName: AVAudioSession.interruptionNotification,
      object: AVAudioSession.sharedInstance(),
      queue: nil
    ) { [weak self] notification in
      let typeValue = notification.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt
      let type = AVAudioSession.InterruptionType(rawValue: typeValue ?? 0)
      guard type == .ended else {
        self?.sendState("interrupted", message: "audio_session_interruption")
        return
      }
      self?.captureQueue.async {
        self?.restartCaptureEngine(reason: "interruption_ended")
      }
    }
    mediaServicesResetObserver = center.addObserver(
      forName: AVAudioSession.mediaServicesWereResetNotification,
      object: AVAudioSession.sharedInstance(),
      queue: nil
    ) { [weak self] _ in
      self?.captureQueue.async {
        self?.restartCaptureEngine(reason: "media_services_reset")
      }
    }
  }

  private func removeAudioSessionObservers() {
    let center = NotificationCenter.default
    if let routeChangeObserver {
      center.removeObserver(routeChangeObserver)
      self.routeChangeObserver = nil
    }
    if let interruptionObserver {
      center.removeObserver(interruptionObserver)
      self.interruptionObserver = nil
    }
    if let mediaServicesResetObserver {
      center.removeObserver(mediaServicesResetObserver)
      self.mediaServicesResetObserver = nil
    }
  }

  private func handleInputBuffer(_ buffer: AVAudioPCMBuffer) {
    guard isCapturing, let converter, let targetFormat else {
      return
    }

    let ratio = targetFormat.sampleRate / buffer.format.sampleRate
    let outputCapacity = AVAudioFrameCount(max(1, Double(buffer.frameLength) * ratio + 8))
    guard let outputBuffer = AVAudioPCMBuffer(pcmFormat: targetFormat, frameCapacity: outputCapacity) else {
      sendState("error", message: "Failed to allocate PCM output buffer.")
      return
    }

    var didProvideInput = false
    var convertError: NSError?
    converter.convert(to: outputBuffer, error: &convertError) { _, outStatus in
      if didProvideInput {
        outStatus.pointee = .noDataNow
        return nil
      }
      didProvideInput = true
      outStatus.pointee = .haveData
      return buffer
    }

    if let convertError {
      sendState("error", message: convertError.localizedDescription)
      return
    }

    guard let channelData = outputBuffer.int16ChannelData else {
      sendState("error", message: "Converted PCM buffer has no int16 channel data.")
      return
    }

    let byteCount = Int(outputBuffer.frameLength) * 2
    if byteCount <= 0 {
      return
    }

    pendingPcm.append(Data(bytes: channelData[0], count: byteCount))
    emitCompleteFrames()
  }

  private func emitCompleteFrames() {
    while pendingPcm.count >= frameSizeBytes {
      let frame = pendingPcm.prefix(frameSizeBytes)
      pendingPcm.removeFirst(frameSizeBytes)
      sequence += 1
      totalBytes += frameSizeBytes

      let body: [String: Any] = [
        "sequence": sequence,
        "timestampMs": nowMs(),
        "elapsedMs": max(0, nowMs() - startedAtMs),
        "audioBase64": Data(frame).base64EncodedString(),
        "byteCount": frameSizeBytes,
        "sampleRate": Int(sampleRate),
        "channels": 1,
        "bitDepth": 16,
        "durationMs": frameDurationMs,
      ]

      DispatchQueue.main.async {
        self.sendEvent("onPcmCaptureFrame", body)
      }
    }
  }

  private func currentStatus(reason: String? = nil) -> [String: Any] {
    var status: [String: Any] = [
      "isCapturing": isCapturing,
      "sampleRate": Int(sampleRate),
      "channels": 1,
      "bitDepth": 16,
      "frameDurationMs": frameDurationMs,
      "frameSizeBytes": frameSizeBytes,
      "frameCount": sequence,
      "totalBytes": totalBytes,
      "elapsedMs": startedAtMs > 0 ? max(0, nowMs() - startedAtMs) : 0,
    ]
    if let reason {
      status["reason"] = reason
    }
    return status
  }

  private func sendState(_ state: String, message: String?) {
    var body = currentStatus()
    body["state"] = state
    if let message {
      body["message"] = message
    }
    DispatchQueue.main.async {
      self.sendEvent("onPcmCaptureState", body)
    }
  }

  private func nowMs() -> Int64 {
    Int64(Date().timeIntervalSince1970 * 1000)
  }
}
