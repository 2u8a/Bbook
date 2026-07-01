// TC39 "Upsert" (getOrInsert / getOrInsertComputed) proposal のポリフィル。
// 最新の pdf.js がこれらを使うが、古いブラウザ（iOS Safari 等）は未対応で
// 「getOrInsertComputed is not a function」エラーになり描画が失敗するため補う。
type AnyMap = {
  has(key: unknown): boolean
  get(key: unknown): unknown
  set(key: unknown, value: unknown): unknown
  getOrInsert?: (key: unknown, value: unknown) => unknown
  getOrInsertComputed?: (key: unknown, fn: (key: unknown) => unknown) => unknown
}

function patch(proto: AnyMap) {
  if (typeof proto.getOrInsertComputed !== 'function') {
    proto.getOrInsertComputed = function (this: AnyMap, key, fn) {
      if (this.has(key)) return this.get(key)
      const value = fn(key)
      this.set(key, value)
      return value
    }
  }
  if (typeof proto.getOrInsert !== 'function') {
    proto.getOrInsert = function (this: AnyMap, key, value) {
      if (this.has(key)) return this.get(key)
      this.set(key, value)
      return value
    }
  }
}

patch(Map.prototype as unknown as AnyMap)
patch(WeakMap.prototype as unknown as AnyMap)
