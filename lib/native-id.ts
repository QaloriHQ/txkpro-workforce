export function nativeId(prefix: string) {
  return `${prefix.toUpperCase()}-${crypto.randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`;
}

export function nativeBridgeKey(entity: string, id: string) {
  return `native:${entity}:${id}`;
}
