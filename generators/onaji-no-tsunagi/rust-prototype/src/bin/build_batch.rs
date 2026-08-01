use onaji_no_tsunagi_rust_prototype::builder::{
    BuildStatus, build_six_by_six_four_four_four, shared_builder_source,
};
use serde::Serialize;
use std::collections::HashSet;
use std::env;
use std::process::ExitCode;
use std::thread;
use std::time::Instant;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Summary {
    profile_id: &'static str,
    seed_prefix: String,
    start: u64,
    attempted: usize,
    accepted: usize,
    unique_topologies: usize,
    duplicate_accepted: usize,
    elapsed_millis: u128,
    attempts_per_second: f64,
    accepted_per_second: f64,
}

fn main() -> ExitCode {
    match run() {
        Ok(()) => ExitCode::SUCCESS,
        Err(message) => {
            eprintln!("{message}");
            ExitCode::FAILURE
        }
    }
}

fn run() -> Result<(), String> {
    let mut seed_prefix = "rust-prototype".to_owned();
    let mut start = 0_u64;
    let mut count = 100_usize;
    let mut jobs = 1_usize;
    let mut summary_only = false;
    let mut arguments = env::args().skip(1);
    while let Some(argument) = arguments.next() {
        match argument.as_str() {
            "--seed-prefix" => {
                seed_prefix = required_value(&mut arguments, "--seed-prefix")?;
            }
            "--start" => {
                start = parse_number(&required_value(&mut arguments, "--start")?, "--start")?
            }
            "--count" => {
                count = parse_number(&required_value(&mut arguments, "--count")?, "--count")?
            }
            "--jobs" => jobs = parse_number(&required_value(&mut arguments, "--jobs")?, "--jobs")?,
            "--summary-only" => summary_only = true,
            "--help" | "-h" => {
                print_help();
                return Ok(());
            }
            _ => return Err(format!("unknown argument: {argument}")),
        }
    }
    if count == 0 || jobs == 0 {
        return Err("--count and --jobs must be positive".to_owned());
    }
    let source = shared_builder_source();
    let tasks: Vec<_> = (0..count)
        .map(|offset| {
            let index = start + offset as u64;
            (offset, format!("{seed_prefix}-{index}"))
        })
        .collect();
    let started = Instant::now();
    let worker_count = jobs.min(count);
    let chunk_size = count.div_ceil(worker_count);
    let mut attempts = thread::scope(|scope| {
        tasks
            .chunks(chunk_size)
            .map(|chunk| {
                scope.spawn(move || {
                    chunk
                        .iter()
                        .map(|(index, seed)| {
                            (*index, build_six_by_six_four_four_four(seed, source))
                        })
                        .collect::<Vec<_>>()
                })
            })
            .collect::<Vec<_>>()
            .into_iter()
            .flat_map(|handle| handle.join().expect("builder worker must not panic"))
            .collect::<Vec<_>>()
    });
    attempts.sort_by_key(|(index, _)| *index);
    let elapsed = started.elapsed();
    let accepted = attempts
        .iter()
        .filter(|(_, attempt)| matches!(attempt.status, BuildStatus::Accepted))
        .count();
    let unique_topologies: HashSet<_> = attempts
        .iter()
        .filter_map(|(_, attempt)| attempt.topology_hash.as_deref())
        .collect();
    if !summary_only {
        for (_, attempt) in &attempts {
            println!(
                "{}",
                serde_json::to_string(attempt)
                    .map_err(|error| format!("failed to serialize attempt: {error}"))?
            );
        }
    }
    let seconds = elapsed.as_secs_f64();
    let summary = Summary {
        profile_id: "6x6-4-4-4",
        seed_prefix,
        start,
        attempted: count,
        accepted,
        unique_topologies: unique_topologies.len(),
        duplicate_accepted: accepted - unique_topologies.len(),
        elapsed_millis: elapsed.as_millis(),
        attempts_per_second: count as f64 / seconds,
        accepted_per_second: accepted as f64 / seconds,
    };
    eprintln!(
        "{}",
        serde_json::to_string(&summary)
            .map_err(|error| format!("failed to serialize summary: {error}"))?
    );
    Ok(())
}

fn required_value(
    arguments: &mut impl Iterator<Item = String>,
    flag: &str,
) -> Result<String, String> {
    arguments
        .next()
        .ok_or_else(|| format!("{flag} requires a value"))
}

fn parse_number<T>(value: &str, flag: &str) -> Result<T, String>
where
    T: std::str::FromStr,
{
    value
        .parse()
        .map_err(|_| format!("{flag} requires an integer"))
}

fn print_help() {
    println!(
        "Usage: build_batch [options]\n\
         \n\
         Builds independent 6x6-4-4-4 prototype candidates.\n\
         \n\
         Options:\n\
           --seed-prefix <text>   Seed range prefix (default: rust-prototype)\n\
           --start <n>            First seed index (default: 0)\n\
           --count <n>            Number of independent attempts (default: 100)\n\
           --jobs <n>             Parallel workers (default: 1)\n\
           --summary-only         Suppress per-attempt NDJSON"
    );
}
