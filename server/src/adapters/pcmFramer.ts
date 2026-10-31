/** Re-chunks arbitrary PCM into exact fixed-size frames, carrying the remainder between calls. */
export class PcmFramer {
  private pending: Buffer = Buffer.alloc(0);

  constructor(private readonly frameBytes: number) {}

  push(pcm: Buffer): Buffer[] {
    const data = this.pending.length ? Buffer.concat([this.pending, pcm]) : pcm;
    const frames: Buffer[] = [];
    let offset = 0;
    while (data.length - offset >= this.frameBytes) {
      frames.push(data.subarray(offset, offset + this.frameBytes));
      offset += this.frameBytes;
    }
    this.pending = Buffer.from(data.subarray(offset));
    return frames;
  }
}
