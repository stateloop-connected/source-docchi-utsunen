# 実装の今の姿

コードの構成、仕様書が実装者に任せた部分の決定、確認のしかたを書きます。ルールと数値は `docs/spec.md` が正で、ここには写しません。コードを変えたら、同じ変更の中でこの文書の該当する節を書き換えます。

## 構成

| パス | 中身 |
| --- | --- |
| `src/core/balance.ts` | 仕様書 3 章・4 章の全数値と表、敵・ブロック・武器・ボスの名前 |
| `src/core/formulas.ts` | 数式（DPS、基準火力、圧力比、サイズ流入、基礎 HP）と、武器名・ボス名・推定 IQ |
| `src/core/rng.ts` | 種つき乱数（mulberry32）とシャッフル。内部状態は数値 1 つ |
| `src/core/deck.ts` | ブロックの袋と山 |
| `src/core/state.ts` | ゲーム状態と出来事の型、`createGame(seed)` |
| `src/core/step.ts` | `step(state, wantLane)`。1 刻み進めて出来事の配列を返す |
| `src/bots/` | 自動プレイヤー。`bot.ts` が共通部分、`threshold.ts` がしきい値ボット、`demo.ts` がデモ AI |
| `src/sim/run.ts` | 画面なしでボットに 1 回遊ばせる |
| `src/sim/cli.ts` | `npm run sim`。合格範囲はこのファイルの先頭にある |
| `tests/` | 単体テスト。`reference/golden.json` を直接読んで比べる |
| `compose.yaml` | 開発・テスト・検証・ビルドを Docker で動かす設定 |
| `.github/workflows/ci.yml` | push と pull request で型検査・テスト・バランス検証・ビルドを行う |

## core の作り

- 状態は関数を持たないただのデータで、`JSON.stringify` でそのまま比べられる。再現性のテストはこれを使っている。
- 敵の列は配列と先頭位置（`head`）で持ち、倒した敵は先頭位置を進めるだけにする。抜け殻が 256 を超えて列の半分以上になったら詰め直す。一斉削除のときだけ配列を作り直す。
- 埋まり度は合計を数え直さず、敵の増減のたびに足し引きする。
- 乱数は、ブロック用（`state.deck.rng`）と敵の出現用（`state.spawnRng`）を状態に持つ。ボット用は `src/bots/bot.ts` が、見た目用は描画側が持つ。
- 数式の計算の順序は参照シミュレータに合わせてある。種 0〜9 の生存時間が全ボットで参照と小数第 2 位まで一致する。

## 確認のしかた

- 単体テスト・バランス検証・型検査・ビルドのコマンドは `CLAUDE.md` の「コマンド」。
- 参照との一致を種ごとに見るときは `docker compose run --rm sim node src/sim/cli.ts --seeds` の出力を、`reference/golden.json` の `sim_reference.*.first10_seeds` と見比べる。
