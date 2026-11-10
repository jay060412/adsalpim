export interface RateLimitResult {
  allowed: boolean;
  /** 다음 요청이 가능해질 때까지 남은 시간(초). allowed가 true면 0 */
  retryAfterSec: number;
}

/**
 * 메모리 기반 슬라이딩 윈도 요청 제한.
 * 서버리스 환경에서는 인스턴스마다 따로 계산되므로 "최선의 노력" 수준의 방어다.
 * 엄격한 제한이 필요하면 Redis 같은 외부 저장소 기반으로 교체해야 한다.
 */
export function createRateLimiter(options: { limit: number; windowMs: number; maxKeys?: number }) {
  const { limit, windowMs, maxKeys = 5_000 } = options;
  const hits = new Map<string, number[]>();

  function prune(now: number) {
    for (const [key, times] of hits) {
      if (times.length === 0 || times[times.length - 1] <= now - windowMs) hits.delete(key);
    }
  }

  return {
    check(key: string, now: number = Date.now()): RateLimitResult {
      const recent = (hits.get(key) ?? []).filter((time) => time > now - windowMs);

      if (recent.length >= limit) {
        hits.set(key, recent);
        return {
          allowed: false,
          retryAfterSec: Math.max(1, Math.ceil((recent[0] + windowMs - now) / 1000)),
        };
      }

      recent.push(now);
      hits.set(key, recent);
      if (hits.size > maxKeys) prune(now);
      return { allowed: true, retryAfterSec: 0 };
    },
  };
}

function envInt(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

const perMinute = createRateLimiter({
  limit: envInt("RATE_LIMIT_PER_MINUTE", 5),
  windowMs: 60_000,
});
const perDay = createRateLimiter({
  limit: envInt("RATE_LIMIT_PER_DAY", 60),
  windowMs: 24 * 60 * 60_000,
});

/** 클라이언트 한 명(IP 기준)의 분석 요청을 분당·일당 횟수로 제한한다. */
export function checkAnalyzeRateLimit(clientKey: string): RateLimitResult {
  const minute = perMinute.check(clientKey);
  if (!minute.allowed) return minute;
  return perDay.check(clientKey);
}

export function clientKeyFromHeaders(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip")?.trim() || "unknown";
}
