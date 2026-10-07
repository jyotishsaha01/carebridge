type Subscriber = (payload: unknown) => void;

const subscribers = new Map<string, Set<Subscriber>>();

export function subscribeNotifications(userId: string, subscriber: Subscriber) {
  let set = subscribers.get(userId);
  if (!set) {
    set = new Set();
    subscribers.set(userId, set);
  }
  set.add(subscriber);
  return () => {
    set?.delete(subscriber);
    if (set?.size === 0) subscribers.delete(userId);
  };
}

export function publishNotification(userId: string, notification: unknown) {
  subscribers.get(userId)?.forEach((subscriber) => {
    try {
      subscriber(notification);
    } catch {
      // A disconnected client must not break notification delivery to others.
    }
  });
}
