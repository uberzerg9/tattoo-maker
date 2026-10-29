/** Measures GPU time per frame with EXT_disjoint_timer_query_webgl2, where the browser offers it. */
export class GpuTimer {
  private readonly gl: WebGL2RenderingContext;
  private readonly ext: { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number } | null;
  private readonly pending: WebGLQuery[] = [];
  private active: WebGLQuery | null = null;
  /** Latest finished measurement, ms; null while unsupported or before the first result. */
  lastMs: number | null = null;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.ext = gl.getExtension("EXT_disjoint_timer_query_webgl2");
  }

  get supported(): boolean {
    return this.ext !== null;
  }

  begin(): void {
    if (!this.ext || this.active) return;
    const q = this.gl.createQuery();
    if (!q) return;
    this.gl.beginQuery(this.ext.TIME_ELAPSED_EXT, q);
    this.active = q;
  }

  end(): void {
    if (!this.ext || !this.active) return;
    this.gl.endQuery(this.ext.TIME_ELAPSED_EXT);
    this.pending.push(this.active);
    this.active = null;
    while (this.pending.length > 8) this.gl.deleteQuery(this.pending.shift()!);
  }

  /** Collects results of finished queries. Never blocks. */
  poll(): void {
    const ext = this.ext;
    if (!ext) return;
    const gl = this.gl;
    const disjoint = Boolean(gl.getParameter(ext.GPU_DISJOINT_EXT));
    while (this.pending.length > 0) {
      const q = this.pending[0]!;
      if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) break;
      if (!disjoint) this.lastMs = Number(gl.getQueryParameter(q, gl.QUERY_RESULT)) / 1e6;
      gl.deleteQuery(q);
      this.pending.shift();
    }
  }

  dispose(): void {
    for (const q of this.pending) this.gl.deleteQuery(q);
    this.pending.length = 0;
    if (this.active) this.gl.deleteQuery(this.active);
    this.active = null;
  }
}
