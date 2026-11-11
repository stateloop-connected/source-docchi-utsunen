# どっち撃つねん

SNS の広告動画でよく見る「敵の大群と強化アイテムが同時に流れてくるシューティング」を、ちゃんと遊べるブラウザゲームにしたもの。

現在はルールの芯とバランス検証までできています。画面はこれから作ります。

## 文書

- 実装を進める人（Claude Code）は `CLAUDE.md` と `docs/START_HERE.md` から読んでください
- 企画は `docs/proposal.md`、仕様は `docs/spec.md`
- 実装の今の姿は `docs/implementation.md`、経緯と決定事項は `docs/decisions.md`

## 開発

Docker で動かします（Node や Python はホストに入れません）。

```sh
docker compose run --rm test        # 単体テスト
docker compose run --rm sim         # バランス検証（最後に「総合: 合格」と出れば成功）
docker compose run --rm check       # 型検査
docker compose run --rm reference   # Python の参照シミュレータ（数分〜十数分かかる）
```
