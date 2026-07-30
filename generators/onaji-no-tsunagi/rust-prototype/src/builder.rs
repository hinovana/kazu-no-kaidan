use crate::{
    Cell, PathSolution, Puzzle, Solution, SolutionCountKind, SolveOptions, SolveResult, Terminal,
    solution_hash, solve_puzzle,
};
use serde::Serialize;
use std::collections::{HashMap, HashSet, VecDeque};
use std::sync::OnceLock;

const WIDTH: u8 = 6;
const HEIGHT: u8 = 6;
const CELL_COUNT: usize = 36;
const FULL_MASK: u64 = (1_u64 << CELL_COUNT) - 1;
const MAXIMUM_TURN_COUNT_PER_PATH: usize = 4;
const MAXIMUM_TOTAL_TURN_COUNT: usize = 15;
const MAXIMUM_CONSTRUCTION_STATES: u64 = 30_000;
const MAXIMUM_SOLVER_STATES: u64 = 30_000;
const LENGTH_PROFILES: [[usize; 6]; 4] = [
    [8, 7, 6, 6, 5, 4],
    [7, 7, 6, 6, 5, 5],
    [8, 6, 6, 6, 5, 5],
    [7, 7, 7, 5, 5, 5],
];
const SYMBOLS: [&str; 3] = ["circle", "square", "triangle"];

#[derive(Clone, Debug)]
struct PathCandidate {
    cells: Vec<u8>,
    occupied: u64,
}

#[derive(Debug)]
pub struct BuilderSource {
    candidates_by_length: HashMap<usize, Vec<PathCandidate>>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum BuildStatus {
    Accepted,
    NotConstructed,
    ConstructionBudgetExhausted,
    SolverBudgetExhausted,
    NotUnique,
    GeometryGateFailed,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BuildAttempt {
    pub seed: String,
    pub status: BuildStatus,
    pub construction_state_count: u64,
    pub symbol_assignments_tried: usize,
    pub solver_state_count: u64,
    pub path_length_profile: Vec<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub puzzle: Option<Puzzle>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub canonical_solution: Option<Solution>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub canonical_solution_hash: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub topology_hash: Option<String>,
}

enum CoverResult {
    Built {
        paths: Vec<PathCandidate>,
        construction_states: u64,
    },
    NotConstructed {
        construction_states: u64,
    },
    BudgetExhausted {
        construction_states: u64,
    },
}

pub fn shared_builder_source() -> &'static BuilderSource {
    static SOURCE: OnceLock<BuilderSource> = OnceLock::new();
    SOURCE.get_or_init(BuilderSource::new)
}

pub fn build_six_by_six_four_four_four(seed: &str, source: &BuilderSource) -> BuildAttempt {
    let mut random = SeededRandom::new(seed);
    let lengths = LENGTH_PROFILES[random.integer(0, LENGTH_PROFILES.len() - 1)].to_vec();
    let cover = select_path_cover(&lengths, &mut random, source);
    let (paths, construction_state_count) = match cover {
        CoverResult::Built {
            paths,
            construction_states,
        } => (paths, construction_states),
        CoverResult::NotConstructed {
            construction_states,
        } => {
            return rejected_attempt(
                seed,
                BuildStatus::NotConstructed,
                construction_states,
                0,
                0,
                lengths,
            );
        }
        CoverResult::BudgetExhausted {
            construction_states,
        } => {
            return rejected_attempt(
                seed,
                BuildStatus::ConstructionBudgetExhausted,
                construction_states,
                0,
                0,
                lengths,
            );
        }
    };

    let mut assignments = symbol_assignments();
    random.shuffle(&mut assignments);
    let mut maximum_solver_states = 0;
    let mut saw_solver_budget = false;
    let mut saw_unique_geometry_rejection = false;
    for (assignment_index, assignment) in assignments.iter().enumerate() {
        let (puzzle, planted_solution, topology_hash) = materialize(seed, &paths, assignment);
        let solved = solve_puzzle(
            &puzzle,
            SolveOptions {
                state_budget: MAXIMUM_SOLVER_STATES,
                solution_limit: 2,
                ..SolveOptions::default()
            },
        )
        .expect("builder materialization must create a valid puzzle");
        let metrics = match &solved {
            SolveResult::Solved { metrics, .. }
            | SolveResult::Unsatisfiable { metrics }
            | SolveResult::BudgetExhausted { metrics, .. } => metrics,
        };
        maximum_solver_states = maximum_solver_states.max(metrics.explored_state_count);
        match solved {
            SolveResult::BudgetExhausted { .. } => {
                saw_solver_budget = true;
            }
            SolveResult::Solved {
                canonical_solution,
                solution_count,
                ..
            } if solution_count.kind == SolutionCountKind::Exact && solution_count.count == 1 => {
                let canonical_hash = solution_hash(&canonical_solution, WIDTH);
                debug_assert_eq!(
                    canonical_hash,
                    solution_hash(&planted_solution, WIDTH),
                    "an exact unique puzzle must normalize to its planted solution",
                );
                if passes_geometry_gate(&canonical_solution) {
                    return BuildAttempt {
                        seed: seed.to_owned(),
                        status: BuildStatus::Accepted,
                        construction_state_count,
                        symbol_assignments_tried: assignment_index + 1,
                        solver_state_count: maximum_solver_states,
                        path_length_profile: lengths,
                        puzzle: Some(puzzle),
                        canonical_solution: Some(canonical_solution),
                        canonical_solution_hash: Some(canonical_hash),
                        topology_hash: Some(topology_hash),
                    };
                }
                saw_unique_geometry_rejection = true;
            }
            _ => {}
        }
    }
    let status = if saw_unique_geometry_rejection {
        BuildStatus::GeometryGateFailed
    } else if saw_solver_budget {
        BuildStatus::SolverBudgetExhausted
    } else {
        BuildStatus::NotUnique
    };
    rejected_attempt(
        seed,
        status,
        construction_state_count,
        assignments.len(),
        maximum_solver_states,
        lengths,
    )
}

impl BuilderSource {
    fn new() -> Self {
        let mut candidates_by_length = HashMap::new();
        for length in 4..=8 {
            candidates_by_length.insert(length, enumerate_paths(length));
        }
        Self {
            candidates_by_length,
        }
    }

    fn candidates(&self, length: usize) -> &[PathCandidate] {
        self.candidates_by_length
            .get(&length)
            .map(Vec::as_slice)
            .unwrap_or_default()
    }
}

fn rejected_attempt(
    seed: &str,
    status: BuildStatus,
    construction_state_count: u64,
    symbol_assignments_tried: usize,
    solver_state_count: u64,
    path_length_profile: Vec<usize>,
) -> BuildAttempt {
    BuildAttempt {
        seed: seed.to_owned(),
        status,
        construction_state_count,
        symbol_assignments_tried,
        solver_state_count,
        path_length_profile,
        puzzle: None,
        canonical_solution: None,
        canonical_solution_hash: None,
        topology_hash: None,
    }
}

fn enumerate_paths(target_length: usize) -> Vec<PathCandidate> {
    let mut seen = HashSet::new();
    let mut result = Vec::new();
    for start in 0..CELL_COUNT as u8 {
        let mut cells = vec![start];
        enumerate_from(
            target_length,
            start,
            set_bit(0, start),
            None,
            0,
            &mut cells,
            &mut seen,
            &mut result,
        );
    }
    result
}

#[allow(clippy::too_many_arguments)]
fn enumerate_from(
    target_length: usize,
    current: u8,
    occupied: u64,
    previous_direction: Option<u8>,
    turn_count: usize,
    cells: &mut Vec<u8>,
    seen: &mut HashSet<Vec<u8>>,
    result: &mut Vec<PathCandidate>,
) {
    if cells.len() == target_length {
        if has_unit_bay(cells) {
            return;
        }
        let reverse: Vec<_> = cells.iter().rev().copied().collect();
        let canonical = if reverse < *cells {
            reverse
        } else {
            cells.clone()
        };
        if seen.insert(canonical.clone()) {
            result.push(PathCandidate {
                cells: canonical,
                occupied,
            });
        }
        return;
    }
    for next in builder_adjacent_indices(current) {
        if is_bit_set(occupied, next) {
            continue;
        }
        let direction = direction_between(current, next);
        let next_turn_count = turn_count
            + usize::from(previous_direction.is_some_and(|previous| previous != direction));
        if next_turn_count > MAXIMUM_TURN_COUNT_PER_PATH {
            continue;
        }
        cells.push(next);
        enumerate_from(
            target_length,
            next,
            set_bit(occupied, next),
            Some(direction),
            next_turn_count,
            cells,
            seen,
            result,
        );
        cells.pop();
    }
}

fn select_path_cover(
    lengths: &[usize],
    random: &mut SeededRandom,
    source: &BuilderSource,
) -> CoverResult {
    let Some(&first_length) = lengths.first() else {
        return CoverResult::NotConstructed {
            construction_states: 0,
        };
    };
    let first_candidates = source.candidates(first_length);
    if first_candidates.is_empty() {
        return CoverResult::NotConstructed {
            construction_states: 0,
        };
    }
    let first = first_candidates[random.integer(0, first_candidates.len() - 1)].clone();
    let mut selected = vec![first.clone()];
    let mut construction_states = 0;
    let mut budget_exhausted = false;
    let found = search_cover(
        &lengths[1..],
        FULL_MASK & !first.occupied,
        random,
        source,
        &mut selected,
        &mut construction_states,
        &mut budget_exhausted,
    );
    if found {
        CoverResult::Built {
            paths: selected,
            construction_states,
        }
    } else if budget_exhausted {
        CoverResult::BudgetExhausted {
            construction_states,
        }
    } else {
        CoverResult::NotConstructed {
            construction_states,
        }
    }
}

#[allow(clippy::too_many_arguments)]
fn search_cover(
    remaining_lengths: &[usize],
    remaining_mask: u64,
    random: &mut SeededRandom,
    source: &BuilderSource,
    selected: &mut Vec<PathCandidate>,
    construction_states: &mut u64,
    budget_exhausted: &mut bool,
) -> bool {
    if *budget_exhausted {
        return false;
    }
    if remaining_lengths.is_empty() {
        return remaining_mask == 0;
    }
    if !components_can_still_be_covered(remaining_mask, remaining_lengths) {
        return false;
    }

    let Some((selected_length_index, mut candidate_indices)) = remaining_lengths
        .iter()
        .enumerate()
        .map(|(index, length)| {
            let candidates = source
                .candidates(*length)
                .iter()
                .enumerate()
                .filter_map(|(candidate_index, candidate)| {
                    ((candidate.occupied & remaining_mask) == candidate.occupied)
                        .then_some(candidate_index)
                })
                .collect::<Vec<_>>();
            (index, candidates)
        })
        .min_by_key(|(index, candidates)| (candidates.len(), *index))
    else {
        return false;
    };
    if candidate_indices.is_empty() {
        return false;
    }
    let selected_length = remaining_lengths[selected_length_index];
    let mut next_lengths = remaining_lengths.to_vec();
    next_lengths.remove(selected_length_index);
    if next_lengths.is_empty() {
        candidate_indices
            .retain(|index| source.candidates(selected_length)[*index].occupied == remaining_mask);
        if candidate_indices.is_empty() {
            return false;
        }
        let candidate_index = candidate_indices[random.integer(0, candidate_indices.len() - 1)];
        selected.push(source.candidates(selected_length)[candidate_index].clone());
        return true;
    }

    random.shuffle(&mut candidate_indices);
    for candidate_index in candidate_indices {
        *construction_states += 1;
        if *construction_states > MAXIMUM_CONSTRUCTION_STATES {
            *budget_exhausted = true;
            return false;
        }
        let candidate = &source.candidates(selected_length)[candidate_index];
        selected.push(candidate.clone());
        if search_cover(
            &next_lengths,
            remaining_mask & !candidate.occupied,
            random,
            source,
            selected,
            construction_states,
            budget_exhausted,
        ) {
            return true;
        }
        selected.pop();
        if *budget_exhausted {
            return false;
        }
    }
    false
}

fn components_can_still_be_covered(remaining_mask: u64, lengths: &[usize]) -> bool {
    if remaining_mask.count_ones() as usize != lengths.iter().sum::<usize>() {
        return false;
    }
    let minimum_length = lengths.iter().copied().min().unwrap_or_default();
    let mut unvisited = remaining_mask;
    let mut component_count = 0;
    while unvisited != 0 {
        component_count += 1;
        if component_count > lengths.len() {
            return false;
        }
        let start = unvisited.trailing_zeros() as u8;
        unvisited &= !bit(start);
        let mut queue = VecDeque::from([start]);
        let mut component_size = 0;
        while let Some(current) = queue.pop_front() {
            component_size += 1;
            for next in builder_adjacent_indices(current) {
                if unvisited & bit(next) != 0 {
                    unvisited &= !bit(next);
                    queue.push_back(next);
                }
            }
        }
        if component_size < minimum_length {
            return false;
        }
    }
    true
}

fn symbol_assignments() -> Vec<[usize; 6]> {
    let mut result = Vec::new();
    let mut current = [0; 6];
    enumerate_assignments(0, &mut [2, 2, 2], &mut current, &mut result);
    result
}

fn enumerate_assignments(
    index: usize,
    remaining: &mut [usize; 3],
    current: &mut [usize; 6],
    result: &mut Vec<[usize; 6]>,
) {
    if index == current.len() {
        result.push(*current);
        return;
    }
    for symbol_index in 0..remaining.len() {
        if remaining[symbol_index] == 0 {
            continue;
        }
        remaining[symbol_index] -= 1;
        current[index] = symbol_index;
        enumerate_assignments(index + 1, remaining, current, result);
        remaining[symbol_index] += 1;
    }
}

fn materialize(
    seed: &str,
    paths: &[PathCandidate],
    assignment: &[usize; 6],
) -> (Puzzle, Solution, String) {
    let mut raw_terminals: Vec<_> = paths
        .iter()
        .enumerate()
        .flat_map(|(path_index, path)| {
            let symbol = SYMBOLS[assignment[path_index]].to_owned();
            [
                (path.cells[0], symbol.clone()),
                (*path.cells.last().expect("path has cells"), symbol),
            ]
        })
        .collect();
    raw_terminals.sort_by(|left, right| left.0.cmp(&right.0).then_with(|| left.1.cmp(&right.1)));
    let terminals: Vec<Terminal> = raw_terminals
        .into_iter()
        .enumerate()
        .map(|(index, (cell, symbol))| Terminal {
            terminal_id: format!("terminal-{}", index + 1),
            symbol,
            row: cell / WIDTH,
            column: cell % WIDTH,
        })
        .collect();
    let planted_solution = Solution {
        paths: paths
            .iter()
            .enumerate()
            .map(|(path_index, path)| PathSolution {
                symbol: SYMBOLS[assignment[path_index]].to_owned(),
                cells: path
                    .cells
                    .iter()
                    .map(|cell| Cell {
                        row: *cell / WIDTH,
                        column: *cell % WIDTH,
                    })
                    .collect(),
            })
            .collect(),
    };
    let topology_hash = format!("{:08x}", fnv1a32(&canonical_topology_signature(&terminals)));
    let puzzle_id = format!(
        "ots-rust-{:08x}",
        fnv1a32(&format!("{seed}|{topology_hash}"))
    );
    (
        Puzzle {
            schema_version: "onaji-no-tsunagi.puzzle.v1".to_owned(),
            puzzle_id,
            width: WIDTH,
            height: HEIGHT,
            terminals,
        },
        planted_solution,
        topology_hash,
    )
}

fn canonical_topology_signature(terminals: &[Terminal]) -> String {
    let mut variants = Vec::with_capacity(8);
    for quarter_turns in 0..4 {
        for reflect in [false, true] {
            let mut groups: HashMap<&str, Vec<String>> = HashMap::new();
            for terminal in terminals {
                let mut row = terminal.row;
                let mut column = terminal.column;
                let mut width = WIDTH;
                let mut height = HEIGHT;
                for _ in 0..quarter_turns {
                    (row, column) = (column, height - 1 - row);
                    (width, height) = (height, width);
                }
                if reflect {
                    column = width - 1 - column;
                }
                groups
                    .entry(terminal.symbol.as_str())
                    .or_default()
                    .push(format!("{row},{column}"));
            }
            let mut normalized_groups: Vec<_> = groups
                .into_values()
                .map(|mut coordinates| {
                    coordinates.sort();
                    coordinates.join(";")
                })
                .collect();
            normalized_groups.sort();
            variants.push(format!("6x6|{}", normalized_groups.join("|")));
        }
    }
    variants.sort();
    variants
        .into_iter()
        .next()
        .unwrap_or_else(|| "6x6|".to_owned())
}

fn passes_geometry_gate(solution: &Solution) -> bool {
    let total_turns: usize = solution
        .paths
        .iter()
        .map(|path| count_turns(&path.cells))
        .sum();
    if total_turns > MAXIMUM_TOTAL_TURN_COUNT {
        return false;
    }
    let horizontal = solution
        .paths
        .iter()
        .filter(|path| {
            path.cells
                .first()
                .is_some_and(|first| path.cells.iter().all(|cell| cell.row == first.row))
        })
        .count();
    let vertical = solution
        .paths
        .iter()
        .filter(|path| {
            path.cells
                .first()
                .is_some_and(|first| path.cells.iter().all(|cell| cell.column == first.column))
        })
        .count();
    horizontal < 3 && vertical < 3
}

fn count_turns(cells: &[Cell]) -> usize {
    cells
        .windows(3)
        .filter(|window| {
            let before = window[0];
            let middle = window[1];
            let after = window[2];
            let first_direction = (
                i16::from(middle.row) - i16::from(before.row),
                i16::from(middle.column) - i16::from(before.column),
            );
            let second_direction = (
                i16::from(after.row) - i16::from(middle.row),
                i16::from(after.column) - i16::from(middle.column),
            );
            first_direction != second_direction
        })
        .count()
}

fn has_unit_bay(cells: &[u8]) -> bool {
    cells.windows(4).any(|window| {
        let first = window[0];
        let last = window[3];
        manhattan(first, last) == 1
    })
}

fn builder_adjacent_indices(index: u8) -> Vec<u8> {
    let row = index / WIDTH;
    let column = index % WIDTH;
    let mut result = Vec::with_capacity(4);
    if row > 0 {
        result.push(index - WIDTH);
    }
    if column > 0 {
        result.push(index - 1);
    }
    if column + 1 < WIDTH {
        result.push(index + 1);
    }
    if row + 1 < HEIGHT {
        result.push(index + WIDTH);
    }
    result
}

fn direction_between(first: u8, second: u8) -> u8 {
    if first.checked_sub(WIDTH) == Some(second) {
        0
    } else if second == first + 1 {
        1
    } else if second == first + WIDTH {
        2
    } else {
        3
    }
}

fn manhattan(first: u8, second: u8) -> u8 {
    (first / WIDTH).abs_diff(second / WIDTH) + (first % WIDTH).abs_diff(second % WIDTH)
}

fn bit(index: u8) -> u64 {
    1_u64 << index
}

fn set_bit(bits: u64, index: u8) -> u64 {
    bits | bit(index)
}

fn is_bit_set(bits: u64, index: u8) -> bool {
    bits & bit(index) != 0
}

fn fnv1a32(value: &str) -> u32 {
    value.chars().fold(0x811c9dc5_u32, |hash, character| {
        (hash ^ u32::from(character)).wrapping_mul(0x0100_0193)
    })
}

struct SeededRandom {
    state: u32,
}

impl SeededRandom {
    fn new(seed: &str) -> Self {
        Self {
            state: fnv1a32(seed),
        }
    }

    fn next_u32(&mut self) -> u32 {
        self.state = self.state.wrapping_add(0x6d2b79f5);
        let mut value = self.state;
        value = (value ^ (value >> 15)).wrapping_mul(value | 1);
        value ^= value.wrapping_add((value ^ (value >> 7)).wrapping_mul(value | 61));
        value ^ (value >> 14)
    }

    fn integer(&mut self, minimum: usize, maximum_inclusive: usize) -> usize {
        let range = maximum_inclusive - minimum + 1;
        minimum + ((u64::from(self.next_u32()) * range as u64) >> 32) as usize
    }

    fn shuffle<T>(&mut self, values: &mut [T]) {
        for index in (1..values.len()).rev() {
            let swap_index = self.integer(0, index);
            values.swap(index, swap_index);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn candidate_paths_are_simple_and_obey_shape_limits() {
        let source = shared_builder_source();
        for length in 4..=8 {
            assert!(!source.candidates(length).is_empty());
            for candidate in source.candidates(length) {
                assert_eq!(candidate.cells.len(), length);
                assert_eq!(candidate.occupied.count_ones() as usize, length);
                assert!(!has_unit_bay(&candidate.cells));
            }
        }
    }

    #[test]
    fn builder_is_deterministic_and_accepted_output_is_exact_unique() {
        let source = shared_builder_source();
        let accepted = (0..100)
            .map(|index| {
                let seed = format!("rust-builder-test-{index}");
                build_six_by_six_four_four_four(&seed, source)
            })
            .find(|attempt| matches!(attempt.status, BuildStatus::Accepted))
            .expect("at least one fixed test seed must be accepted");
        let repeated = build_six_by_six_four_four_four(&accepted.seed, source);
        assert!(matches!(repeated.status, BuildStatus::Accepted));
        assert_eq!(
            accepted.canonical_solution_hash,
            repeated.canonical_solution_hash
        );
        assert_eq!(accepted.puzzle, repeated.puzzle);
    }
}
