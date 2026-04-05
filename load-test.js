import http from "k6/http";
import { check } from "k6";

export const options = {
  scenarios: {
    chunk_uploads: {
      executor: "constant-arrival-rate",
      rate: 5000,           // 5,000 req/s
      timeUnit: "1s",
      duration: "1m",       // → 300K requests in 60s
      preAllocatedVUs: 500,
      maxVUs: 1000,
    },
  },
};

export default function () {
  const payload = JSON.stringify({
    chunkId: `chunk-${__VU}-${__ITER}`,
    data: "x".repeat(1024), // 1KB dummy chunk
  });

  const res = http.post("http://localhost:3000/api/chunks/upload", payload, {
    headers: { "Content-Type": "application/json" },
  });

  check(res, {
    "status 200": (r) => r.status === 200,
  });
}