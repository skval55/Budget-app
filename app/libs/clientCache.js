const STORAGE_PREFIX = "budget-cache:";

const memoryCache = new Map();

export const CacheNamespaces = {
  home: "home:v1",
  overview: "overview:v1",
  savings: "savings:v1",
  notifications: "notifications:v1",
};

export const CacheTTL = {
  short: 60 * 1000,
  medium: 3 * 60 * 1000,
  long: 10 * 60 * 1000,
};

const canUseStorage = () =>
  typeof window !== "undefined" && typeof window.localStorage !== "undefined";

const toStorageKey = (key) => `${STORAGE_PREFIX}${key}`;

const getSafeNow = () => Date.now();

const isEnvelopeValid = (value) =>
  Boolean(
    value &&
      typeof value === "object" &&
      typeof value.expiresAt === "number" &&
      Object.prototype.hasOwnProperty.call(value, "value")
  );

const removeFromStorage = (key) => {
  if (!canUseStorage()) return;
  try {
    window.localStorage.removeItem(toStorageKey(key));
  } catch (_error) {
    // Ignore storage failures.
  }
};

const readEnvelopeFromStorage = (key) => {
  if (!canUseStorage()) return null;

  try {
    const rawValue = window.localStorage.getItem(toStorageKey(key));
    if (!rawValue) return null;

    const parsedValue = JSON.parse(rawValue);
    if (!isEnvelopeValid(parsedValue)) {
      removeFromStorage(key);
      return null;
    }

    if (parsedValue.expiresAt <= getSafeNow()) {
      removeFromStorage(key);
      return null;
    }

    return parsedValue;
  } catch (_error) {
    removeFromStorage(key);
    return null;
  }
};

const readEnvelope = (key) => {
  const memoryValue = memoryCache.get(key);
  if (memoryValue) {
    if (memoryValue.expiresAt > getSafeNow()) {
      return memoryValue;
    }
    memoryCache.delete(key);
    removeFromStorage(key);
  }

  const storedValue = readEnvelopeFromStorage(key);
  if (storedValue) {
    memoryCache.set(key, storedValue);
  }
  return storedValue;
};

const stableSerialize = (value) => {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item)).join(",")}]`;
  }

  if (value && typeof value === "object") {
    const objectValue = value;
    const keys = Object.keys(objectValue).sort();
    const pairs = keys.map(
      (key) => `${JSON.stringify(key)}:${stableSerialize(objectValue[key])}`
    );
    return `{${pairs.join(",")}}`;
  }

  return JSON.stringify(value);
};

export const buildCacheKey = (baseKey, params = null) => {
  if (!params || (typeof params === "object" && Object.keys(params).length === 0)) {
    return baseKey;
  }
  return `${baseKey}:${stableSerialize(params)}`;
};

export const getCachedValue = (key) => {
  const envelope = readEnvelope(key);
  return envelope ? envelope.value : null;
};

export const setCachedValue = (key, value, ttlMs = CacheTTL.medium) => {
  const ttl = Number.isFinite(ttlMs) && ttlMs > 0 ? ttlMs : CacheTTL.medium;
  const envelope = {
    value,
    expiresAt: getSafeNow() + ttl,
  };

  memoryCache.set(key, envelope);

  if (!canUseStorage()) return;

  try {
    window.localStorage.setItem(toStorageKey(key), JSON.stringify(envelope));
  } catch (_error) {
    // Ignore storage failures.
  }
};

export const removeCachedValue = (key) => {
  memoryCache.delete(key);
  removeFromStorage(key);
};

export const clearCacheByPrefix = (prefix) => {
  const keys = Array.from(memoryCache.keys());
  keys.forEach((key) => {
    if (key.startsWith(prefix)) {
      memoryCache.delete(key);
    }
  });

  if (!canUseStorage()) return;

  try {
    for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
      const storageKey = window.localStorage.key(index);
      if (!storageKey) continue;
      if (storageKey.startsWith(toStorageKey(prefix))) {
        window.localStorage.removeItem(storageKey);
      }
    }
  } catch (_error) {
    // Ignore storage failures.
  }
};
