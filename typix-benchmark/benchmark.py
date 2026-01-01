#!/usr/bin/env python3
"""
Typix VLLM Benchmark Tool

Usage:
    uv run benchmark.py                    # Run all tests
    uv run benchmark.py --single           # Single request test only
    uv run benchmark.py --concurrent 20    # Test specific concurrency level
    uv run benchmark.py --ramp             # Ramp up test (10, 20, 30, 40, 50)
"""

import asyncio
import statistics
import time
import argparse
from dataclasses import dataclass

import httpx
from rich.console import Console
from rich.table import Table
from rich.progress import Progress, SpinnerColumn, TextColumn
from rich.panel import Panel

# Configuration
API_URL = "https://vllm.kernelvm.xyz/v1/chat/completions"
MODEL = "typix-medium-epo"

# Test sentences with typical errors
TEST_SENTENCES = [
    "I cant beleive how much this extention has helped me with my writting.",
    "Its been a lifesaver for my dayly work and comunication.",
    "I use to make alot of mistakes but now im more confidant.",
    "Thier going to be suprised when they see the improvment.",
    "This sentance has a few erors that need to be fixed.",
    "The wether is beautifull today and I want to go outsde.",
    "Please recieve this messge and respond as soon as posible.",
    "I definitly recomend this tool to anyone who writes alot.",
    "Your absolutly right about that, I totaly agree with you.",
    "Lets schedul a meeting for tommorow afternoon if your availible.",
]

console = Console()


@dataclass
class RequestResult:
    latency_ms: float
    success: bool
    error: str | None = None


async def make_request(client: httpx.AsyncClient, sentence: str) -> RequestResult:
    """Make a single API request and measure latency."""
    payload = {
        "model": MODEL,
        "messages": [
            {
                "role": "system",
                "content": "Fix spelling and grammar. Make minimal changes. Return only the corrected text.",
            },
            {"role": "user", "content": sentence},
        ],
        "temperature": 0.2,
        "min_p": 0.15,
        "repetition_penalty": 1.05,
    }

    start = time.perf_counter()
    try:
        response = await client.post(API_URL, json=payload, timeout=30.0)
        latency = (time.perf_counter() - start) * 1000

        if response.status_code == 200:
            return RequestResult(latency_ms=latency, success=True)
        else:
            return RequestResult(
                latency_ms=latency,
                success=False,
                error=f"HTTP {response.status_code}",
            )
    except Exception as e:
        latency = (time.perf_counter() - start) * 1000
        return RequestResult(latency_ms=latency, success=False, error=str(e))


async def test_single_request() -> list[RequestResult]:
    """Test single request latency (5 runs)."""
    results = []
    async with httpx.AsyncClient() as client:
        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            console=console,
        ) as progress:
            task = progress.add_task("Single request test (5 runs)...", total=5)

            for i in range(5):
                sentence = TEST_SENTENCES[i % len(TEST_SENTENCES)]
                result = await make_request(client, sentence)
                results.append(result)
                progress.advance(task)

    return results


async def test_concurrent(concurrency: int, total_requests: int = 50) -> list[RequestResult]:
    """Test concurrent requests."""
    results = []
    semaphore = asyncio.Semaphore(concurrency)

    async def bounded_request(client: httpx.AsyncClient, sentence: str):
        async with semaphore:
            return await make_request(client, sentence)

    async with httpx.AsyncClient() as client:
        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            console=console,
        ) as progress:
            task = progress.add_task(
                f"Concurrent test (c={concurrency}, n={total_requests})...",
                total=total_requests,
            )

            # Create all tasks
            tasks = []
            for i in range(total_requests):
                sentence = TEST_SENTENCES[i % len(TEST_SENTENCES)]
                tasks.append(bounded_request(client, sentence))

            # Run with progress updates
            for coro in asyncio.as_completed(tasks):
                result = await coro
                results.append(result)
                progress.advance(task)

    return results


def calculate_stats(results: list[RequestResult]) -> dict:
    """Calculate statistics from results."""
    successful = [r for r in results if r.success]
    latencies = [r.latency_ms for r in successful]

    if not latencies:
        return {"error": "No successful requests"}

    sorted_latencies = sorted(latencies)
    n = len(sorted_latencies)

    return {
        "total": len(results),
        "success": len(successful),
        "errors": len(results) - len(successful),
        "min": min(latencies),
        "max": max(latencies),
        "avg": statistics.mean(latencies),
        "p50": sorted_latencies[int(n * 0.50)],
        "p95": sorted_latencies[int(n * 0.95)] if n >= 20 else sorted_latencies[-1],
        "p99": sorted_latencies[int(n * 0.99)] if n >= 100 else sorted_latencies[-1],
        "throughput": len(successful) / (sum(latencies) / 1000) if latencies else 0,
    }


def print_results(title: str, stats: dict):
    """Print results in a nice table."""
    if "error" in stats:
        console.print(f"[red]{title}: {stats['error']}[/red]")
        return

    table = Table(title=title, show_header=True)
    table.add_column("Metric", style="cyan")
    table.add_column("Value", style="green")
    table.add_column("Target", style="yellow")
    table.add_column("Status", style="bold")

    def status(value: float, target: float) -> str:
        return "[green]PASS[/green]" if value <= target else "[red]FAIL[/red]"

    table.add_row("Total Requests", str(stats["total"]), "-", "-")
    table.add_row("Successful", str(stats["success"]), "-", "-")
    table.add_row("Errors", str(stats["errors"]), "0", "[green]OK[/green]" if stats["errors"] == 0 else "[red]!!![/red]")
    table.add_row("Min Latency", f"{stats['min']:.0f}ms", "-", "-")
    table.add_row("Avg Latency", f"{stats['avg']:.0f}ms", "-", "-")
    table.add_row("P50 Latency", f"{stats['p50']:.0f}ms", "<300ms", status(stats["p50"], 300))
    table.add_row("P95 Latency", f"{stats['p95']:.0f}ms", "<500ms", status(stats["p95"], 500))
    table.add_row("P99 Latency", f"{stats['p99']:.0f}ms", "<800ms", status(stats["p99"], 800))
    table.add_row("Max Latency", f"{stats['max']:.0f}ms", "-", "-")
    table.add_row("Throughput", f"{stats['throughput']:.1f} req/s", "-", "-")

    console.print(table)
    console.print()


async def run_ramp_test():
    """Run ramp-up test from 10 to 50 concurrent."""
    console.print(Panel.fit("[bold]Ramp-Up Test[/bold]\nTesting: 10, 20, 30, 40, 50 concurrent", style="blue"))

    all_stats = []

    for concurrency in [10, 20, 30, 40, 50]:
        console.print(f"\n[bold cyan]Testing {concurrency} concurrent requests...[/bold cyan]")
        results = await test_concurrent(concurrency, total_requests=concurrency * 5)
        stats = calculate_stats(results)
        stats["concurrency"] = concurrency
        all_stats.append(stats)
        print_results(f"Concurrency: {concurrency}", stats)

        # Cool down between tests
        await asyncio.sleep(2)

    # Summary table
    summary = Table(title="Ramp-Up Summary", show_header=True)
    summary.add_column("Concurrent", style="cyan")
    summary.add_column("P50", style="green")
    summary.add_column("P99", style="yellow")
    summary.add_column("Throughput", style="blue")
    summary.add_column("Status")

    for s in all_stats:
        if "error" in s:
            continue
        p99_ok = s["p99"] < 800
        summary.add_row(
            str(s["concurrency"]),
            f"{s['p50']:.0f}ms",
            f"{s['p99']:.0f}ms",
            f"{s['throughput']:.1f}/s",
            "[green]OK[/green]" if p99_ok else "[red]DEGRADED[/red]",
        )

    console.print(summary)

    # Find breaking point
    for s in all_stats:
        if "error" not in s and s["p99"] >= 800:
            console.print(f"\n[yellow]Breaking point: {s['concurrency']} concurrent (P99 >= 800ms)[/yellow]")
            console.print(f"[green]Recommended max: {s['concurrency'] - 10} concurrent[/green]")
            break
    else:
        console.print("\n[green]All tests passed! Server can handle 50+ concurrent requests.[/green]")


async def main():
    parser = argparse.ArgumentParser(description="Typix VLLM Benchmark Tool")
    parser.add_argument("--single", action="store_true", help="Run single request test only")
    parser.add_argument("--concurrent", type=int, help="Test specific concurrency level")
    parser.add_argument("--ramp", action="store_true", help="Run ramp-up test (10-50)")
    parser.add_argument("--url", type=str, help="Override API URL")
    parser.add_argument("--model", type=str, help="Override model name")
    args = parser.parse_args()

    global API_URL, MODEL
    if args.url:
        API_URL = args.url
    if args.model:
        MODEL = args.model

    console.print(Panel.fit(
        f"[bold]Typix VLLM Benchmark[/bold]\n"
        f"URL: {API_URL}\n"
        f"Model: {MODEL}",
        style="blue",
    ))

    if args.single:
        console.print("\n[bold cyan]Single Request Test[/bold cyan]")
        results = await test_single_request()
        stats = calculate_stats(results)
        print_results("Single Request (5 runs)", stats)

    elif args.concurrent:
        console.print(f"\n[bold cyan]Concurrent Test (c={args.concurrent})[/bold cyan]")
        results = await test_concurrent(args.concurrent, total_requests=args.concurrent * 5)
        stats = calculate_stats(results)
        print_results(f"Concurrent: {args.concurrent}", stats)

    elif args.ramp:
        await run_ramp_test()

    else:
        # Run all tests
        console.print("\n[bold cyan]1. Single Request Test[/bold cyan]")
        single_results = await test_single_request()
        single_stats = calculate_stats(single_results)
        print_results("Single Request (5 runs)", single_stats)

        await asyncio.sleep(1)

        console.print("\n[bold cyan]2. Ramp-Up Test[/bold cyan]")
        await run_ramp_test()


if __name__ == "__main__":
    asyncio.run(main())
