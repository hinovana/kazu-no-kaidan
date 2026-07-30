use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet, VecDeque};
use std::fmt;

pub mod builder;

const SUPPORTED_SCHEMA: &str = "onaji-no-tsunagi.puzzle.v1";
const DEFAULT_STATE_BUDGET: u64 = 200_000;
const DEFAULT_SOLUTION_LIMIT: usize = 2;

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Puzzle {
    pub schema_version: String,
    pub puzzle_id: String,
    pub width: u8,
    pub height: u8,
    pub terminals: Vec<Terminal>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Terminal {
    pub terminal_id: String,
    pub symbol: String,
    pub row: u8,
    pub column: u8,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Cell {
    pub row: u8,
    pub column: u8,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PathSolution {
    pub symbol: String,
    pub cells: Vec<Cell>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Solution {
    pub paths: Vec<PathSolution>,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum SolutionCountKind {
    Exact,
    AtLeast,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SolutionCount {
    pub kind: SolutionCountKind,
    pub count: usize,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SolverMetrics {
    pub explored_state_count: u64,
    pub backtrack_count: u64,
    pub maximum_decision_depth: usize,
    pub pairing_count_tried: u64,
    pub residual_reachability_prune_count: u64,
    pub component_parity_prune_count: u64,
    pub memoized_failure_prune_count: u64,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum SolveResult {
    Solved {
        #[serde(rename = "canonicalSolution")]
        canonical_solution: Solution,
        #[serde(rename = "solutionCount")]
        solution_count: SolutionCount,
        metrics: SolverMetrics,
    },
    Unsatisfiable {
        metrics: SolverMetrics,
    },
    BudgetExhausted {
        #[serde(rename = "partialSolutionCount")]
        partial_solution_count: usize,
        metrics: SolverMetrics,
    },
}

#[derive(Clone, Copy, Debug)]
pub struct SolveOptions {
    pub state_budget: u64,
    pub solution_limit: usize,
    pub use_component_parity: bool,
    pub use_failure_memo: bool,
}

impl Default for SolveOptions {
    fn default() -> Self {
        Self {
            state_budget: DEFAULT_STATE_BUDGET,
            solution_limit: DEFAULT_SOLUTION_LIMIT,
            use_component_parity: true,
            use_failure_memo: true,
        }
    }
}

#[derive(Debug, PartialEq, Eq)]
pub struct PuzzleError(String);

impl fmt::Display for PuzzleError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.0)
    }
}

impl std::error::Error for PuzzleError {}

#[derive(Clone, Debug)]
struct InternalTerminal {
    terminal_id: String,
    symbol: String,
    index: u8,
}

#[derive(Clone, Debug)]
struct InternalPath {
    symbol: String,
    cells: Vec<u8>,
}

#[derive(Clone, Debug, Hash, PartialEq, Eq)]
struct SearchStateKey {
    occupied: u64,
    remaining: Vec<String>,
}

struct Solver<'a> {
    puzzle: &'a Puzzle,
    terminals: Vec<InternalTerminal>,
    terminal_mask: u64,
    options: SolveOptions,
    solutions: Vec<Solution>,
    solution_hashes: HashSet<String>,
    failed_states: HashSet<SearchStateKey>,
    metrics: SolverMetrics,
    budget_exhausted: bool,
    stopped_at_limit: bool,
}

impl<'a> Solver<'a> {
    fn new(puzzle: &'a Puzzle, options: SolveOptions) -> Self {
        let mut terminals: Vec<_> = puzzle
            .terminals
            .iter()
            .map(|terminal| InternalTerminal {
                terminal_id: terminal.terminal_id.clone(),
                symbol: terminal.symbol.clone(),
                index: cell_index(terminal.row, terminal.column, puzzle.width),
            })
            .collect();
        terminals.sort_by(|left, right| {
            left.index
                .cmp(&right.index)
                .then_with(|| left.terminal_id.cmp(&right.terminal_id))
        });
        let terminal_mask = terminals
            .iter()
            .fold(0_u64, |mask, terminal| set_bit(mask, terminal.index));
        Self {
            puzzle,
            terminals,
            terminal_mask,
            options: SolveOptions {
                state_budget: options.state_budget.max(1),
                solution_limit: options.solution_limit.max(1),
                ..options
            },
            solutions: Vec::new(),
            solution_hashes: HashSet::new(),
            failed_states: HashSet::new(),
            metrics: SolverMetrics::default(),
            budget_exhausted: false,
            stopped_at_limit: false,
        }
    }

    fn run(mut self) -> SolveResult {
        let remaining: Vec<usize> = (0..self.terminals.len()).collect();
        self.search_terminals(&remaining, 0, &[], 0);
        if self.budget_exhausted {
            return SolveResult::BudgetExhausted {
                partial_solution_count: self.solutions.len(),
                metrics: self.metrics,
            };
        }
        let Some(canonical_solution) = self.solutions.into_iter().next() else {
            return SolveResult::Unsatisfiable {
                metrics: self.metrics,
            };
        };
        SolveResult::Solved {
            canonical_solution,
            solution_count: SolutionCount {
                kind: if self.stopped_at_limit {
                    SolutionCountKind::AtLeast
                } else {
                    SolutionCountKind::Exact
                },
                count: self.solution_hashes.len(),
            },
            metrics: self.metrics,
        }
    }

    fn search_terminals(
        &mut self,
        remaining: &[usize],
        occupied: u64,
        paths: &[InternalPath],
        depth: usize,
    ) -> bool {
        if self.should_stop() {
            return false;
        }
        self.metrics.maximum_decision_depth = self.metrics.maximum_decision_depth.max(depth);
        if remaining.is_empty() {
            let solution = normalize_solution(paths, self.puzzle.width);
            let hash = solution_hash(&solution, self.puzzle.width);
            if self.solution_hashes.insert(hash) {
                self.solutions.push(solution);
            }
            if self.solutions.len() >= self.options.solution_limit {
                self.stopped_at_limit = true;
            }
            return true;
        }

        let key = self.search_state_key(occupied, remaining);
        if self.options.use_failure_memo && self.failed_states.contains(&key) {
            self.metrics.memoized_failure_prune_count += 1;
            return false;
        }
        if self.options.use_component_parity
            && !self.has_even_symbol_parity_in_every_component(remaining, occupied)
        {
            self.metrics.component_parity_prune_count += 1;
            if self.options.use_failure_memo {
                self.failed_states.insert(key);
            }
            return false;
        }

        let Some((terminal_index, partners)) =
            self.select_most_constrained_terminal(remaining, occupied)
        else {
            self.metrics.residual_reachability_prune_count += 1;
            self.metrics.backtrack_count += 1;
            if self.options.use_failure_memo {
                self.failed_states.insert(key);
            }
            return false;
        };
        if partners.is_empty() {
            self.metrics.residual_reachability_prune_count += 1;
            self.metrics.backtrack_count += 1;
            if self.options.use_failure_memo {
                self.failed_states.insert(key);
            }
            return false;
        }

        let mut found = false;
        for partner_index in partners {
            if self.should_stop() {
                break;
            }
            self.metrics.pairing_count_tried += 1;
            let next_remaining: Vec<_> = remaining
                .iter()
                .copied()
                .filter(|candidate| *candidate != terminal_index && *candidate != partner_index)
                .collect();
            found = self.enumerate_paths(
                terminal_index,
                partner_index,
                &next_remaining,
                occupied,
                paths,
                depth,
            ) || found;
        }
        if !found && !self.should_stop() && self.options.use_failure_memo {
            self.failed_states.insert(key);
        }
        found
    }

    fn select_most_constrained_terminal(
        &self,
        remaining: &[usize],
        occupied: u64,
    ) -> Option<(usize, Vec<usize>)> {
        let mut selected: Option<(usize, Vec<usize>, usize)> = None;
        for &terminal_index in remaining {
            let terminal = &self.terminals[terminal_index];
            let mut partners: Vec<_> = remaining
                .iter()
                .copied()
                .filter(|candidate_index| {
                    let candidate = &self.terminals[*candidate_index];
                    candidate.symbol == terminal.symbol
                        && candidate.terminal_id != terminal.terminal_id
                })
                .collect();
            partners.sort_by(|left, right| {
                let left_terminal = &self.terminals[*left];
                let right_terminal = &self.terminals[*right];
                manhattan(terminal.index, left_terminal.index, self.puzzle.width)
                    .cmp(&manhattan(
                        terminal.index,
                        right_terminal.index,
                        self.puzzle.width,
                    ))
                    .then_with(|| left_terminal.terminal_id.cmp(&right_terminal.terminal_id))
            });
            partners.retain(|candidate_index| {
                self.is_reachable(
                    terminal.index,
                    self.terminals[*candidate_index].index,
                    occupied,
                )
            });
            let free_exit_count =
                adjacent_indices(terminal.index, self.puzzle.width, self.puzzle.height)
                    .into_iter()
                    .filter(|index| !is_bit_set(occupied, *index))
                    .count();
            let replace = selected.as_ref().is_none_or(
                |(selected_index, selected_partners, selected_exits)| {
                    partners.len() < selected_partners.len()
                        || (partners.len() == selected_partners.len()
                            && free_exit_count < *selected_exits)
                        || (partners.len() == selected_partners.len()
                            && free_exit_count == *selected_exits
                            && terminal.terminal_id < self.terminals[*selected_index].terminal_id)
                },
            );
            if replace {
                selected = Some((terminal_index, partners, free_exit_count));
            }
        }
        selected.map(|(terminal_index, partners, _)| (terminal_index, partners))
    }

    #[allow(clippy::too_many_arguments)]
    fn enumerate_paths(
        &mut self,
        first_index: usize,
        second_index: usize,
        remaining: &[usize],
        occupied: u64,
        completed_paths: &[InternalPath],
        depth: usize,
    ) -> bool {
        let start = self.terminals[first_index].index;
        let target = self.terminals[second_index].index;
        let symbol = self.terminals[first_index].symbol.clone();
        let mut path = vec![start];
        let mut found = false;
        self.walk_path(
            target,
            &symbol,
            remaining,
            occupied,
            completed_paths,
            depth,
            start,
            set_bit(0, start),
            &mut path,
            &mut found,
        );
        found
    }

    #[allow(clippy::too_many_arguments)]
    fn walk_path(
        &mut self,
        target: u8,
        symbol: &str,
        remaining: &[usize],
        occupied: u64,
        completed_paths: &[InternalPath],
        depth: usize,
        current: u8,
        visited: u64,
        path: &mut Vec<u8>,
        found: &mut bool,
    ) {
        if self.should_stop() {
            return;
        }
        self.metrics.explored_state_count += 1;
        if self.metrics.explored_state_count > self.options.state_budget {
            self.budget_exhausted = true;
            return;
        }
        if current == target {
            let mut next_paths = completed_paths.to_vec();
            next_paths.push(InternalPath {
                symbol: symbol.to_owned(),
                cells: path.clone(),
            });
            *found = self.search_terminals(remaining, occupied | visited, &next_paths, depth + 1)
                || *found;
            return;
        }

        let mut candidates: Vec<_> =
            adjacent_indices(current, self.puzzle.width, self.puzzle.height)
                .into_iter()
                .filter(|index| self.can_enter_path_cell(*index, target, occupied, visited))
                .collect();
        candidates.sort_by(|left, right| {
            manhattan(*left, target, self.puzzle.width)
                .cmp(&manhattan(*right, target, self.puzzle.width))
                .then_with(|| left.cmp(right))
        });
        if candidates.is_empty() {
            self.metrics.backtrack_count += 1;
        }
        for next in candidates {
            let next_visited = set_bit(visited, next);
            let next_occupied = occupied | next_visited;
            if next != target
                && path.len().is_multiple_of(3)
                && !self.all_terminals_have_reachable_partners(remaining, next_occupied)
            {
                self.metrics.residual_reachability_prune_count += 1;
                self.metrics.backtrack_count += 1;
                continue;
            }
            path.push(next);
            self.walk_path(
                target,
                symbol,
                remaining,
                occupied,
                completed_paths,
                depth,
                next,
                next_visited,
                path,
                found,
            );
            path.pop();
            if self.should_stop() {
                return;
            }
            self.metrics.backtrack_count += 1;
        }
    }

    fn search_state_key(&self, occupied: u64, remaining: &[usize]) -> SearchStateKey {
        let mut terminal_ids: Vec<_> = remaining
            .iter()
            .map(|index| self.terminals[*index].terminal_id.clone())
            .collect();
        terminal_ids.sort();
        SearchStateKey {
            occupied,
            remaining: terminal_ids,
        }
    }

    fn can_enter_path_cell(&self, index: u8, target: u8, occupied: u64, visited: u64) -> bool {
        if is_bit_set(occupied, index) || is_bit_set(visited, index) {
            return false;
        }
        index == target || !is_bit_set(self.terminal_mask, index)
    }

    fn is_reachable(&self, start: u8, target: u8, occupied: u64) -> bool {
        if start == target {
            return true;
        }
        let mut queue = VecDeque::from([start]);
        let mut seen = set_bit(0, start);
        while let Some(current) = queue.pop_front() {
            for next in adjacent_indices(current, self.puzzle.width, self.puzzle.height) {
                if is_bit_set(seen, next) || is_bit_set(occupied, next) {
                    continue;
                }
                if is_bit_set(self.terminal_mask, next) && next != target {
                    continue;
                }
                if next == target {
                    return true;
                }
                seen = set_bit(seen, next);
                queue.push_back(next);
            }
        }
        false
    }

    fn all_terminals_have_reachable_partners(&self, remaining: &[usize], occupied: u64) -> bool {
        remaining.iter().all(|terminal_index| {
            let terminal = &self.terminals[*terminal_index];
            remaining.iter().any(|candidate_index| {
                let candidate = &self.terminals[*candidate_index];
                candidate.terminal_id != terminal.terminal_id
                    && candidate.symbol == terminal.symbol
                    && self.is_reachable(terminal.index, candidate.index, occupied)
            })
        })
    }

    fn has_even_symbol_parity_in_every_component(
        &self,
        remaining: &[usize],
        occupied: u64,
    ) -> bool {
        let cell_count = usize::from(self.puzzle.width) * usize::from(self.puzzle.height);
        let mut component_by_index = vec![i16::MIN; cell_count];
        let mut component = 0_i16;
        for start in 0..cell_count {
            let start = start as u8;
            if component_by_index[usize::from(start)] != i16::MIN || is_bit_set(occupied, start) {
                continue;
            }
            let mut queue = VecDeque::from([start]);
            component_by_index[usize::from(start)] = component;
            while let Some(current) = queue.pop_front() {
                for next in adjacent_indices(current, self.puzzle.width, self.puzzle.height) {
                    if component_by_index[usize::from(next)] == i16::MIN
                        && !is_bit_set(occupied, next)
                    {
                        component_by_index[usize::from(next)] = component;
                        queue.push_back(next);
                    }
                }
            }
            component += 1;
        }
        let mut counts: HashMap<(i16, &str), usize> = HashMap::new();
        for terminal_index in remaining {
            let terminal = &self.terminals[*terminal_index];
            let component_id = component_by_index[usize::from(terminal.index)];
            *counts
                .entry((component_id, terminal.symbol.as_str()))
                .or_default() += 1;
        }
        counts.values().all(|count| count % 2 == 0)
    }

    fn should_stop(&self) -> bool {
        self.budget_exhausted || self.stopped_at_limit
    }
}

pub fn solve_puzzle(puzzle: &Puzzle, options: SolveOptions) -> Result<SolveResult, PuzzleError> {
    validate_puzzle(puzzle)?;
    Ok(Solver::new(puzzle, options).run())
}

pub fn solution_hash(solution: &Solution, width: u8) -> String {
    let normalized = normalize_serialized_solution(solution, width);
    normalized
        .paths
        .iter()
        .map(|path| {
            let indices = path
                .cells
                .iter()
                .map(|cell| cell_index(cell.row, cell.column, width).to_string())
                .collect::<Vec<_>>()
                .join(".");
            format!("{}:{indices}", path.symbol)
        })
        .collect::<Vec<_>>()
        .join("|")
}

fn normalize_solution(paths: &[InternalPath], width: u8) -> Solution {
    let serialized = Solution {
        paths: paths
            .iter()
            .map(|path| PathSolution {
                symbol: path.symbol.clone(),
                cells: path
                    .cells
                    .iter()
                    .map(|index| Cell {
                        row: *index / width,
                        column: *index % width,
                    })
                    .collect(),
            })
            .collect(),
    };
    normalize_serialized_solution(&serialized, width)
}

fn normalize_serialized_solution(solution: &Solution, width: u8) -> Solution {
    let mut paths = solution.paths.clone();
    for path in &mut paths {
        let forward: Vec<_> = path
            .cells
            .iter()
            .map(|cell| cell_index(cell.row, cell.column, width))
            .collect();
        let reverse: Vec<_> = forward.iter().rev().copied().collect();
        if reverse < forward {
            path.cells.reverse();
        }
    }
    paths.sort_by(|left, right| {
        left.symbol.cmp(&right.symbol).then_with(|| {
            let left_indices: Vec<_> = left
                .cells
                .iter()
                .map(|cell| cell_index(cell.row, cell.column, width))
                .collect();
            let right_indices: Vec<_> = right
                .cells
                .iter()
                .map(|cell| cell_index(cell.row, cell.column, width))
                .collect();
            left_indices.cmp(&right_indices)
        })
    });
    Solution { paths }
}

fn validate_puzzle(puzzle: &Puzzle) -> Result<(), PuzzleError> {
    if puzzle.schema_version != SUPPORTED_SCHEMA {
        return Err(PuzzleError("unsupported schemaVersion".to_owned()));
    }
    if puzzle.puzzle_id.is_empty() {
        return Err(PuzzleError("puzzleId must not be empty".to_owned()));
    }
    if !(2..=9).contains(&puzzle.width) || !(2..=9).contains(&puzzle.height) {
        return Err(PuzzleError(
            "board dimensions must be integers from 2 through 9".to_owned(),
        ));
    }
    let cell_count = u16::from(puzzle.width) * u16::from(puzzle.height);
    if cell_count > 64 {
        return Err(PuzzleError(
            "Rust prototype supports boards of at most 64 cells".to_owned(),
        ));
    }
    if puzzle.terminals.is_empty() {
        return Err(PuzzleError("puzzle must have terminals".to_owned()));
    }
    let mut ids = HashSet::new();
    let mut cells = HashSet::new();
    let mut symbol_counts: HashMap<&str, usize> = HashMap::new();
    for terminal in &puzzle.terminals {
        if !matches!(terminal.symbol.as_str(), "circle" | "square" | "triangle") {
            return Err(PuzzleError(format!("unknown symbol: {}", terminal.symbol)));
        }
        if terminal.row >= puzzle.height || terminal.column >= puzzle.width {
            return Err(PuzzleError(format!(
                "terminal is outside board: {}",
                terminal.terminal_id
            )));
        }
        if terminal.terminal_id.is_empty() || !ids.insert(terminal.terminal_id.as_str()) {
            return Err(PuzzleError(format!(
                "empty or duplicate terminalId: {}",
                terminal.terminal_id
            )));
        }
        if !cells.insert((terminal.row, terminal.column)) {
            return Err(PuzzleError("terminal cells must be unique".to_owned()));
        }
        *symbol_counts.entry(terminal.symbol.as_str()).or_default() += 1;
    }
    if symbol_counts
        .values()
        .any(|count| *count < 2 || count % 2 != 0)
    {
        return Err(PuzzleError(
            "each used symbol must have a positive even terminal count".to_owned(),
        ));
    }
    Ok(())
}

fn adjacent_indices(index: u8, width: u8, height: u8) -> Vec<u8> {
    let row = index / width;
    let column = index % width;
    let mut result = Vec::with_capacity(4);
    if row > 0 {
        result.push(index - width);
    }
    if column + 1 < width {
        result.push(index + 1);
    }
    if row + 1 < height {
        result.push(index + width);
    }
    if column > 0 {
        result.push(index - 1);
    }
    result
}

fn manhattan(left: u8, right: u8, width: u8) -> u8 {
    let left_row = left / width;
    let left_column = left % width;
    let right_row = right / width;
    let right_column = right % width;
    left_row.abs_diff(right_row) + left_column.abs_diff(right_column)
}

fn cell_index(row: u8, column: u8, width: u8) -> u8 {
    row * width + column
}

fn is_bit_set(bits: u64, index: u8) -> bool {
    bits & (1_u64 << index) != 0
}

fn set_bit(bits: u64, index: u8) -> u64 {
    bits | (1_u64 << index)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn puzzle(json: &str) -> Puzzle {
        serde_json::from_str(json).expect("fixture must be valid JSON")
    }

    #[test]
    fn distinguishes_multiple_unsatisfiable_and_budget_exhausted() {
        let multiple = puzzle(include_str!("../fixtures/multiple-pairing.json"));
        let result = solve_puzzle(
            &multiple,
            SolveOptions {
                state_budget: 10_000,
                solution_limit: 2,
                ..SolveOptions::default()
            },
        )
        .unwrap();
        assert!(matches!(
            result,
            SolveResult::Solved {
                solution_count: SolutionCount {
                    kind: SolutionCountKind::AtLeast,
                    count: 2,
                },
                ..
            }
        ));

        let impossible = puzzle(include_str!("../fixtures/impossible.json"));
        assert!(matches!(
            solve_puzzle(&impossible, SolveOptions::default()).unwrap(),
            SolveResult::Unsatisfiable { .. }
        ));

        assert!(matches!(
            solve_puzzle(
                &multiple,
                SolveOptions {
                    state_budget: 1,
                    solution_limit: 100,
                    ..SolveOptions::default()
                }
            )
            .unwrap(),
            SolveResult::BudgetExhausted { .. }
        ));
    }

    #[test]
    fn matches_typescript_canonical_hash_for_fixed_six_by_six() {
        let fixture = puzzle(include_str!("../fixtures/6x6-4-4-4.json"));
        let result = solve_puzzle(
            &fixture,
            SolveOptions {
                state_budget: 500_000,
                solution_limit: 2,
                ..SolveOptions::default()
            },
        )
        .unwrap();
        let SolveResult::Solved {
            canonical_solution,
            solution_count,
            ..
        } = result
        else {
            panic!("fixture must be solved");
        };
        assert_eq!(solution_count.kind, SolutionCountKind::Exact);
        assert_eq!(solution_count.count, 1);
        assert_eq!(
            solution_hash(&canonical_solution, fixture.width),
            "circle:5.4.3.2.8.14|circle:11.17.23.29.35.34|square:7.13.19.25.24.30|square:10.16.22.28.27.33.32.31|triangle:1.0.6.12.18|triangle:9.15.21.20.26"
        );
    }
}
