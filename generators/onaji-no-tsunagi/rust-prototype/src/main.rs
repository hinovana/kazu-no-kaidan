use onaji_no_tsunagi_rust_prototype::{
    Puzzle, SolveOptions, SolveResult, solution_hash, solve_puzzle,
};
use serde::Serialize;
use std::env;
use std::fs;
use std::io::{self, Read};
use std::process::ExitCode;
use std::thread;
use std::time::Instant;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Output {
    puzzle_id: String,
    elapsed_micros: u128,
    solution_hash: Option<String>,
    #[serde(flatten)]
    result: SolveResult,
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
    let mut input_path: Option<String> = None;
    let mut state_budget = 200_000_u64;
    let mut solution_limit = 2_usize;
    let mut iterations = 1_usize;
    let mut jobs = 1_usize;
    let mut arguments = env::args().skip(1);
    while let Some(argument) = arguments.next() {
        match argument.as_str() {
            "--input" => input_path = Some(required_value(&mut arguments, "--input")?),
            "--state-budget" => {
                state_budget = parse_number(
                    &required_value(&mut arguments, "--state-budget")?,
                    "--state-budget",
                )?
            }
            "--solution-limit" => {
                solution_limit = parse_number(
                    &required_value(&mut arguments, "--solution-limit")?,
                    "--solution-limit",
                )?
            }
            "--iterations" => {
                iterations = parse_number(
                    &required_value(&mut arguments, "--iterations")?,
                    "--iterations",
                )?
            }
            "--jobs" => jobs = parse_number(&required_value(&mut arguments, "--jobs")?, "--jobs")?,
            "--help" | "-h" => {
                print_help();
                return Ok(());
            }
            _ => return Err(format!("unknown argument: {argument}")),
        }
    }
    let input = match input_path.as_deref() {
        Some("-") | None => {
            let mut input = String::new();
            io::stdin()
                .read_to_string(&mut input)
                .map_err(|error| format!("failed to read stdin: {error}"))?;
            input
        }
        Some(path) => fs::read_to_string(path)
            .map_err(|error| format!("failed to read input file {path}: {error}"))?,
    };
    let puzzles = parse_puzzles(&input)?;
    let options = SolveOptions {
        state_budget,
        solution_limit,
        ..SolveOptions::default()
    };
    let tasks: Vec<_> = (0..iterations.max(1))
        .flat_map(|_| puzzles.iter())
        .enumerate()
        .collect();
    let mut outputs = solve_tasks(&tasks, options, jobs.max(1))?;
    outputs.sort_by_key(|(index, _)| *index);
    for (_, output) in outputs {
        println!(
            "{}",
            serde_json::to_string(&output)
                .map_err(|error| format!("failed to serialize result: {error}"))?
        );
    }
    Ok(())
}

fn solve_tasks(
    tasks: &[(usize, &Puzzle)],
    options: SolveOptions,
    jobs: usize,
) -> Result<Vec<(usize, Output)>, String> {
    let worker_count = jobs.min(tasks.len().max(1));
    if worker_count == 1 {
        return tasks
            .iter()
            .map(|(index, puzzle)| solve_one(*index, puzzle, options))
            .collect();
    }
    let chunk_size = tasks.len().div_ceil(worker_count);
    let worker_results = thread::scope(|scope| {
        tasks
            .chunks(chunk_size)
            .map(|chunk| {
                scope.spawn(move || {
                    chunk
                        .iter()
                        .map(|(index, puzzle)| solve_one(*index, puzzle, options))
                        .collect::<Result<Vec<_>, _>>()
                })
            })
            .collect::<Vec<_>>()
            .into_iter()
            .map(|handle| {
                handle
                    .join()
                    .map_err(|_| "Rust solver worker panicked".to_owned())?
            })
            .collect::<Result<Vec<_>, String>>()
    })?;
    Ok(worker_results.into_iter().flatten().collect())
}

fn solve_one(
    index: usize,
    puzzle: &Puzzle,
    options: SolveOptions,
) -> Result<(usize, Output), String> {
    let started = Instant::now();
    let result = solve_puzzle(puzzle, options)
        .map_err(|error| format!("invalid puzzle {}: {error}", puzzle.puzzle_id))?;
    let hash = match &result {
        SolveResult::Solved {
            canonical_solution, ..
        } => Some(solution_hash(canonical_solution, puzzle.width)),
        _ => None,
    };
    Ok((
        index,
        Output {
            puzzle_id: puzzle.puzzle_id.clone(),
            elapsed_micros: started.elapsed().as_micros(),
            solution_hash: hash,
            result,
        },
    ))
}

fn parse_puzzles(input: &str) -> Result<Vec<Puzzle>, String> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return Err("input is empty".to_owned());
    }
    if trimmed.starts_with('[') {
        return serde_json::from_str(trimmed)
            .map_err(|error| format!("failed to parse puzzle array: {error}"));
    }
    trimmed
        .lines()
        .filter(|line| !line.trim().is_empty())
        .enumerate()
        .map(|(index, line)| {
            serde_json::from_str(line)
                .map_err(|error| format!("failed to parse input line {}: {error}", index + 1))
        })
        .collect()
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
        .map_err(|_| format!("{flag} requires a positive integer"))
}

fn print_help() {
    println!(
        "Usage: onaji-no-tsunagi-rust-prototype [options]\n\
         \n\
         Reads one Puzzle JSON per line, or a JSON array, and writes NDJSON.\n\
         \n\
         Options:\n\
           --input <path|->       Input file; '-' or omitted means stdin\n\
           --state-budget <n>     Maximum explored path states (default: 200000)\n\
           --solution-limit <n>   Stop after this many normalized solutions (default: 2)\n\
           --iterations <n>       Repeat the input set for benchmarking (default: 1)\n\
           --jobs <n>             Solve independent inputs in parallel (default: 1)"
    );
}
