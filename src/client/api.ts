import { useCallback, useEffect, useRef, useState } from 'react'

export type AnyRecord = Record<string, any>
export type RemoteApi = AnyRecord | undefined

export function randomOperation(prefix: string): string {
  return `${prefix}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 9)}`
}

export function methodOf(api: RemoteApi, method: string): ((...args: any[]) => any) | undefined {
  const direct = api?.[method]
  if (typeof direct === 'function') return direct.bind(api)
  const nested = api?.v1?.[method]
  if (typeof nested === 'function') return nested.bind(api?.v1)
  return undefined
}

export async function callRemote<T>(api: RemoteApi, method: string, args: any[] = []): Promise<T> {
  const fn = methodOf(api, method)
  if (!fn) throw new Error(`Harness Remote 未提供 skillManager.${method}`)
  return unwrapRemoteResult<T>(await fn(...args), method)
}

/**
 * Gateway methods always resolve to a discriminated `{ ok, value | error }`
 * envelope.  Preview adapters and older test doubles return the business
 * value directly, so those remain accepted while real Host failures become
 * ordinary errors for the existing query/mutation error surfaces.
 */
export function unwrapRemoteResult<T>(response: unknown, method = 'unknown'): T {
  if (!response || typeof response !== 'object' || !Object.prototype.hasOwnProperty.call(response, 'ok')) {
    return response as T
  }
  const result = response as AnyRecord
  if (result.ok === true) return result.value as T
  if (result.ok === false) {
    const failure = result.error
    const error = failure instanceof Error
      ? failure
      : new Error(String(failure?.message || `Harness Remote ${method} 调用失败`))
    if (failure && typeof failure === 'object') {
      Object.assign(error, {
        code: failure.code,
        details: failure.details,
        error: failure,
      })
    }
    throw error
  }
  return response as T
}

export function useRemoteQuery<T>(api: RemoteApi, method: string, args: any[], fallback: T, enabled = true): { data: T; loading: boolean; error?: string; reload: () => void } {
  const key = JSON.stringify(args)
  const [data, setData] = useState<T>(fallback)
  const [loading, setLoading] = useState(enabled)
  const [error, setError] = useState<string>()
  const [revision, setRevision] = useState(0)
  const loaded = useRef<{ api: RemoteApi; method: string; key: string } | undefined>(undefined)
  useEffect(() => {
    let alive = true
    if (!enabled || !api) { setLoading(false); return () => { alive = false } }
    setLoading(true); setError(undefined)
    void callRemote<T>(api, method, args)
      .then(value => { if (alive) { loaded.current = { api, method, key }; setData(value) } })
      .catch(reason => { if (alive) setError(safeError(reason)) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  // The API is injected once per Client Context. JSON is intentional here: query
  // args are transport JSON and keeping the key stable avoids a refetch per render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, method, key, enabled, revision])
  return { data, loading: loading && !(loaded.current?.api === api && loaded.current?.method === method && loaded.current?.key === key), error, reload: () => setRevision(value => value + 1) }
}

export function useMutation(api: RemoteApi, method: string, onChanged?: () => void): { run: (request?: any, options?: { signal?: AbortSignal; direct?: boolean }) => Promise<any>; busy: boolean; error?: string; clear: () => void } {
  const [busy, setBusy] = useState(false)
  const inFlight = useRef(false)
  const [error, setError] = useState<string>()
  const run = useCallback(async (request: any = {}, options: { signal?: AbortSignal; direct?: boolean } = {}) => {
    if (inFlight.current) throw new Error('当前操作正在提交，请等待完成。')
    inFlight.current = true
    setBusy(true); setError(undefined)
    try {
      // ID/query methods are intentionally direct and have a strict one-argument
      // Gateway signature.  Passing an undefined cancellation argument makes the
      // generated Remote reject the call before it reaches Host.  Mutations keep
      // the operation id + request + signal contract.
      const value = options.direct ? await callRemote(api, method, [request]) : await callRemote(api, method, [randomOperation(method), request, options.signal])
      onChanged?.(); return value
    } catch (reason) {
      const message = safeError(reason); setError(message); throw reason
    } finally { inFlight.current = false; setBusy(false) }
  }, [api, method, onChanged])
  return { run, busy, error, clear: () => setError(undefined) }
}

export function safeError(reason: any): string {
  return reason?.message || reason?.error?.message || reason?.details?.message || String(reason || '操作失败')
}
