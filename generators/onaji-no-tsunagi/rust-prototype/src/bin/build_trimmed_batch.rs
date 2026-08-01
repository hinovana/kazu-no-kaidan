use onaji_no_tsunagi_rust_prototype::builder::{
    BuildStatus, TrimmedBaseResult, TrimmedGenerationCounters,
    build_trimmed_six_by_six_four_four_four, shared_builder_source,
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
    implementation: &'static str,
    seed_prefix: String,
    requested_candidate_count: usize,
    selected_candidate_count: usize,
    maximum_base_count: usize,
    base_accepted_count: usize,
    variants_per_base: usize,
    unique_topology_count: usize,
    duplicate_topology_count: usize,
    counters: TrimmedGenerationCounters,
    elapsed_millis: u128,
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
    let mut seed_prefix = "rust-31-cell-audit-v1".to_owned();
    let mut requested_candidate_count = 1_000_usize;
    let mut maximum_base_count = 1_000_usize;
    let mut variants_per_base = 200_usize;
    let mut jobs = 1_usize;
    let mut arguments = env::args().skip(1);
    while let Some(argument) = arguments.next() {
        match argument.as_str() {
            "--seed-prefix" => {
                seed_prefix = required_value(&mut arguments, "--seed-prefix")?;
            }
            "--accepted-count" => {
                requested_candidate_count = parse_number(
                    &required_value(&mut arguments, "--accepted-count")?,
                    "--accepted-count",
                )?;
            }
            "--maximum-base-count" => {
                maximum_base_count = parse_number(
                    &required_value(&mut arguments, "--maximum-base-count")?,
                    "--maximum-base-count",
                )?;
            }
            "--variants-per-base" => {
                variants_per_base = parse_number(
                    &required_value(&mut arguments, "--variants-per-base")?,
                    "--variants-per-base",
                )?;
            }
            "--jobs" => {
                jobs = parse_number(&required_value(&mut arguments, "--jobs")?, "--jobs")?;
            }
            "--help" | "-h" => {
                print_help();
                return Ok(());
            }
            _ => return Err(format!("unknown argument: {argument}")),
        }
    }
    if requested_candidate_count == 0
        || maximum_base_count == 0
        || variants_per_base == 0
        || jobs == 0
    {
        return Err("all numeric options must be positive".to_owned());
    }

    let source = shared_builder_source();
    let tasks: Vec<_> = (0..maximum_base_count)
        .map(|base_index| (base_index, format!("{seed_prefix}-base-{base_index}")))
        .collect();
    let started = Instant::now();
    let worker_count = jobs.min(tasks.len());
    let chunk_size = tasks.len().div_ceil(worker_count);
    let mut base_results = thread::scope(|scope| {
        tasks
            .chunks(chunk_size)
            .map(|chunk| {
                scope.spawn(move || {
                    chunk
                        .iter()
                        .map(|(base_index, base_seed)| {
                            build_trimmed_six_by_six_four_four_four(
                                base_seed,
                                *base_index,
                                variants_per_base,
                                source,
                            )
                        })
                        .collect::<Vec<_>>()
                })
            })
            .collect::<Vec<_>>()
            .into_iter()
            .flat_map(|handle| handle.join().expect("builder worker must not panic"))
            .collect::<Vec<_>>()
    });
    base_results.sort_by_key(|result| result.base_index);

    let mut selected = Vec::with_capacity(requested_candidate_count);
    let mut topology_hashes = HashSet::new();
    let mut duplicate_topology_count = 0;
    for result in &base_results {
        for candidate in &result.candidates {
            if !topology_hashes.insert(candidate.topology_hash.clone()) {
                duplicate_topology_count += 1;
                continue;
            }
            if selected.len() < requested_candidate_count {
                selected.push(candidate);
            }
        }
    }
    if selected.len() != requested_candidate_count {
        return Err(format!(
            "generated only {} unique candidates; requested {}",
            selected.len(),
            requested_candidate_count,
        ));
    }
    for candidate in selected {
        println!(
            "{}",
            serde_json::to_string(candidate)
                .map_err(|error| format!("failed to serialize candidate: {error}"))?
        );
    }

    let summary = Summary {
        profile_id: "6x6-4-4-4",
        implementation: "rust-prototype-builder-and-solver",
        seed_prefix,
        requested_candidate_count,
        selected_candidate_count: requested_candidate_count,
        maximum_base_count,
        base_accepted_count: base_results
            .iter()
            .filter(|result| matches!(result.base_status, BuildStatus::Accepted))
            .count(),
        variants_per_base,
        unique_topology_count: topology_hashes.len(),
        duplicate_topology_count,
        counters: sum_counters(&base_results),
        elapsed_millis: started.elapsed().as_millis(),
    };
    eprintln!(
        "{}",
        serde_json::to_string(&summary)
            .map_err(|error| format!("failed to serialize summary: {error}"))?
    );
    Ok(())
}

fn sum_counters(results: &[TrimmedBaseResult]) -> TrimmedGenerationCounters {
    let mut total = TrimmedGenerationCounters::default();
    for result in results {
        total.transformation_attempt_count += result.counters.transformation_attempt_count;
        total.duplicate_transformation_count += result.counters.duplicate_transformation_count;
        total.entry_rejected_count += result.counters.entry_rejected_count;
        total.solver_budget_exhausted_count += result.counters.solver_budget_exhausted_count;
        total.non_unique_count += result.counters.non_unique_count;
        total.geometry_gate_rejected_count += result.counters.geometry_gate_rejected_count;
        total.accepted_candidate_count += result.counters.accepted_candidate_count;
    }
    total
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
        "Usage: build_trimmed_batch [options]\n\
         \n\
         Builds Rust 6x6-4-4-4 bases, trims five endpoint cells, and\n\
         re-proves exact uniqueness with the Rust solver.\n\
         \n\
         Options:\n\
           --seed-prefix <text>       Base seed prefix\n\
           --accepted-count <n>       Unique candidates to emit (default: 1000)\n\
           --maximum-base-count <n>   Base seeds to process (default: 1000)\n\
           --variants-per-base <n>    Trim variants per accepted base (default: 200)\n\
           --jobs <n>                 Parallel workers (default: 1)"
    );
}
