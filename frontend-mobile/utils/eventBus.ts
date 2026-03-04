type Handler = (payload?: any) => void;

const listeners: Record<string, Handler[]> = {};

export const eventBus = {
  on(event: string, handler: Handler) {
    if (!listeners[event]) listeners[event] = [];
    listeners[event].push(handler);
    return () => this.off(event, handler);
  },
  off(event: string, handler: Handler) {
    if (!listeners[event]) return;
    listeners[event] = listeners[event].filter((h) => h !== handler);
  },
  emit(event: string, payload?: any) {
    if (!listeners[event]) return;
    listeners[event].forEach((h) => {
      try {
        h(payload);
      } catch (e) {
        // swallow
      }
    });
  }
};

export default eventBus;
