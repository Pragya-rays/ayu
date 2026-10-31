// Forwards raw microphone samples to the main thread, where they are resampled and framed.
class PcmCapture extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0]?.[0];
    if (channel) this.port.postMessage(channel.slice(0));
    return true;
  }
}

registerProcessor("pcm-capture", PcmCapture);
