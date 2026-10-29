type Handler<P> = (payload: P) => void;

/** Minimal typed event emitter. */
export class Emitter<Events extends object> {
  private readonly handlers = new Map<keyof Events, Set<Handler<never>>>();

  on<K extends keyof Events>(event: K, cb: Handler<Events[K]>): () => void {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(cb as Handler<never>);
    return () => {
      set.delete(cb as Handler<never>);
    };
  }

  emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    this.handlers
      .get(event)
      ?.forEach((cb) => (cb as Handler<Events[K]>)(payload));
  }

  clear(): void {
    this.handlers.clear();
  }
}
