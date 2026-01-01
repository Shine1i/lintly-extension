# Typix VLLM Benchmark

Benchmark tool for testing VLLM server capacity.

## Usage

```bash
cd typix-benchmark

# Run all tests (single + ramp-up)
uv run benchmark.py

# Single request test only (baseline)
uv run benchmark.py --single

# Test specific concurrency level
uv run benchmark.py --concurrent 20

# Ramp-up test (10, 20, 30, 40, 50 concurrent)
uv run benchmark.py --ramp

# Use different URL/model
uv run benchmark.py --url http://192.168.0.147:8003/v1/chat/completions --model /app/models/Typix-1.5
```

## What it measures

- **Single request latency**: Baseline performance (5 requests)
- **Concurrent load**: P50, P95, P99 latencies at various concurrency levels
- **Breaking point**: Where P99 exceeds 800ms
- **Throughput**: Requests per second

## Targets

| Metric | Target |
|--------|--------|
| P50 | < 300ms |
| P95 | < 500ms |
| P99 | < 800ms |
