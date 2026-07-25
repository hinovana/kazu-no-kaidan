/**
 * 本文中の各文が物語理解へ果たす役割。
 *
 * @remarks
 * 設問の根拠役割とは別の軸であり、設問に使われない文にも必ず付ける。
 */
export type NarrativeFunction =
  | "set_scene"
  | "characterize"
  | "observe"
  | "hypothesize"
  | "attempt"
  | "compare"
  | "encounter_problem"
  | "decide"
  | "intervene"
  | "understand"
  | "react"
  | "resolve"
  | "aftermath";
