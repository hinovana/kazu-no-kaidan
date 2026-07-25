import type { Worksheet } from "../domain/types/worksheet.ts";

export function DeveloperDiagnostics({ worksheet }: { readonly worksheet: Worksheet }) {
  return (
    <details className="ots-diagnostics screen-only">
      <summary>開発診断</summary>
      <p>
        自動検査: {worksheet.machineChecks.allPassed ? "全件通過" : "失敗"} /
        人間レビュー: 未実施 / 難易度校正: 未実施
      </p>
      <div className="ots-diagnostic-grid">
        {worksheet.puzzles.map((generated, index) => (
          <section key={generated.puzzle.puzzleId}>
            <h3>問題 {index + 1}</h3>
            <dl>
              <div><dt>盤面</dt><dd>{generated.puzzle.width}×{generated.puzzle.height}</dd></div>
              <div>
                <dt>端点構成</dt>
                <dd>
                  {generated.puzzle.terminals.length}個
                  （{generated.provenance.terminalPattern}）
                </dd>
              </div>
              <div><dt>経路数</dt><dd>{generated.canonicalSolution.paths.length}</dd></div>
              <div>
                <dt>唯一解の使用マス</dt>
                <dd>
                  {generated.answerCoverage.usedCellCount}/{generated.answerCoverage.totalCellCount}
                  （{Math.round(generated.answerCoverage.coverageRatio * 100)}%）
                </dd>
              </div>
              <div>
                <dt>最適cost</dt>
                <dd>
                  {generated.solutionCost.totalEdgeCount}辺 /
                  {generated.solutionCost.totalTurnCount}曲がり /
                  U字{generated.solutionCost.unitBayCount}
                </dd>
              </div>
              <div>
                <dt>唯一性</dt>
                <dd>exact: 1</dd>
              </div>
              <div>
                <dt>唯一性証明状態</dt>
                <dd>{generated.uniquenessProof.exploredStateCount}</dd>
              </div>
              <div><dt>取っ掛かり</dt><dd>{generated.entry.machineStatus}</dd></div>
              <div>
                <dt>初期仮説指標</dt>
                <dd>{generated.entry.naturalHypothesisCount}通り</dd>
              </div>
              <div>
                <dt>ペアリング候補</dt>
                <dd>{generated.entry.pairingChoiceCount}通り</dd>
              </div>
              <>
                <div>
                  <dt>局所的な強制出口</dt>
                  <dd>{generated.entry.forcedExitTerminalIds.length}個</dd>
                </div>
                <div>
                  <dt>同一行・列の最大端点</dt>
                  <dd>{generated.entry.maximumLineConcentration}個</dd>
                </div>
              </>
              <div>
                <dt>証明済み相互作用</dt>
                <dd>{generated.interactionWitnesses.length}件</dd>
              </div>
              <div>
                <dt>最適性証明状態</dt>
                <dd>{generated.qualityProof.exploredStateCount}</dd>
              </div>
              <div>
                <dt>植え込み膨張</dt>
                <dd>{generated.generationWitness.plantedInflationEdgeCount}辺</dd>
              </div>
              <div><dt>探索状態</dt><dd>{generated.difficulty.exploredStateCount}</dd></div>
              <div><dt>撤回</dt><dd>{generated.difficulty.backtrackCount}</dd></div>
              <div><dt>ペア候補指標</dt><dd>{generated.difficulty.pairingChoiceCount}</dd></div>
              <div><dt>回廊判断の連鎖</dt><dd>{generated.difficulty.revisionChainLength}</dd></div>
              <div>
                <dt>到達不能枝の除外</dt>
                <dd>{generated.difficulty.residualReachabilityPruneCount}</dd>
              </div>
              <div><dt>最短ペアの罠</dt><dd>{generated.difficulty.nearestPairTrap ? "あり" : "なし"}</dd></div>
              <div>
                <dt>採用candidate</dt>
                <dd>
                  {generated.provenance.candidateIndex}
                  （先行棄却{generated.provenance.precedingRejections.length}件）
                </dd>
              </div>
              <div><dt>topology</dt><dd>{generated.provenance.topologyHash}</dd></div>
            </dl>
          </section>
        ))}
      </div>
    </details>
  );
}
