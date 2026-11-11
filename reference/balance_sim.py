#!/usr/bin/env python3
"""どっち撃つねん 参照シミュレータ

docs/spec.md の 2章(ルール)・3章(バランス)・4章(データ)・5章(デモAI)・9章(ボット)を
そのまま実装した、画面なしのゲームロジック。TypeScript 実装の答え合わせに使う。

    python3 balance_sim.py            # 全ボット 100 回ずつの集計と合格判定
    python3 balance_sim.py --golden   # golden.json (単体テスト用の期待値) を書き出す
    python3 balance_sim.py --knobs    # 調整つまみごとの感度 (時間がかかる)

乱数は mulberry32。JavaScript の定番実装と同じ値列を返すので、
袋の中身(ブロックの順番)は TypeScript 側でも種ごとに完全一致する。
"""
import json, math, statistics, sys
from multiprocessing import Pool

# ---------------------------------------------------------------- 乱数
M32 = 0xFFFFFFFF
def mulberry32(seed):
    a = seed & M32
    def rnd():
        nonlocal a
        a = (a + 0x6D2B79F5) & M32
        t = a
        t = ((t ^ (t >> 15)) * (t | 1)) & M32
        t = ((t + (((t ^ (t >> 7)) * (t | 61)) & M32)) & M32) ^ t
        return ((t ^ (t >> 14)) & M32) / 4294967296
    return rnd

def shuffle(a, rnd):
    """Fisher-Yates。i = n-1 から 1 まで、j = floor(rnd() * (i+1)) と入れ替える"""
    for i in range(len(a) - 1, 0, -1):
        j = int(rnd() * (i + 1))
        a[i], a[j] = a[j], a[i]

SPAWN_SALT = 0x9E3779B9   # 敵の出現用の乱数列の種 = seed + SPAWN_SALT
BOT_SALT = 0x85EBCA6B     # ボット用の乱数列の種   = seed + BOT_SALT

# ---------------------------------------------------------------- 設定値 (spec 3.4, 4章)
P = dict(
    TPS=60,                       # 1秒あたりの刻み数
    D0=40.0, G=1.2,
    R_REF=0.44 / 3,               # 4/30 + 2/150 [rank/s]
    PHI0=0.30, KAPPA=0.0034,
    S0=3.0, S_SLOPE=0.02, S_MAX=8.0,
    CAP=100.0,
    WAVE=20.0, RUSH_LEN=5.0, RUSH_MULT=2.0,
    BOSS_EVERY=5, BOSS_COEF=7.0, BOSS_SIZE=20.0,
    BLOCK_FIRST=3.0, BLOCK_INTERVAL=5.0, BLOCK_TRAVEL=10.0,
    SWITCH=0.15,
    COST=dict(rank=3.5, gold=7.0, buddy=4.0, bomb=1.5, vacation=2.0, expand=2.5, trap=0.7, hat=1.5),
    GOLD_RANKS=2, BUDDY_DPS=0.10, BUDDY_MAX=3,
    BOMB_SIZE=35.0, BOMB_BOSS=0.15,
    VACATION=6.0, EXPAND=10.0, EXPAND_MAX=3, TRAP_COUNT=20,
    REV_RATE=0.10, REV_TIME=20.0,
)
# (id, HP倍率, サイズ, 解禁WAVE, 重み, 1回の出現数)  ※s̄・m̄ は「倍率×数」「サイズ×数」で計算する
ENEMY_TYPES = [
    ("notice",    1.0,  1.0, 1, 10.0, 1),
    ("spam",      0.35, 0.5, 3, 2.0,  8),
    ("deadline",  5.0,  3.0, 6, 1.5,  1),
    ("revolving", 1.5,  1.5, 9, 1.5,  1),
]
OTHERS = ["gold", "bomb", "bomb", "bomb", "trap", "trap", "hat", "vacation"]   # + サポート枠2枚

# ---------------------------------------------------------------- 数式 (spec 3.2)
def dps_of(rank, p): return p["D0"] * p["G"] ** rank
def d_ref(t, p): return p["D0"] * p["G"] ** (p["R_REF"] * t)
def phi(t, p): return p["PHI0"] * math.exp(p["KAPPA"] * t)
def size_rate(t, p): return min(p["S_MAX"], p["S0"] + p["S_SLOPE"] * t)
def wave_of(t, p): return int(t // p["WAVE"]) + 1
def unlocked(t, p): return [e for e in ENEMY_TYPES if e[3] <= wave_of(t, p)]
def base_hp(t, p):
    ts = unlocked(t, p); tot = sum(e[4] for e in ts)
    s_bar = sum(e[2] * e[5] * e[4] for e in ts) / tot
    m_bar = sum(e[1] * e[5] * e[4] for e in ts) / tot
    return phi(t, p) * d_ref(t, p) * s_bar / (size_rate(t, p) * m_bar)

# ---------------------------------------------------------------- ブロックの袋 (spec 4.3)
class Deck:
    def __init__(self, seed, p):
        self.rnd = mulberry32(seed); self.p = p
        self.first = True; self.bag = []; self.pile = []; self.sup_given = 0
    def draw(self):
        p = self.p
        if self.first:
            self.first = False; return "rank"
        if not self.bag:
            if len(self.pile) < 2:
                sup = []
                for _ in range(2):
                    if self.sup_given < p["BUDDY_MAX"]: sup.append("buddy")
                    elif self.sup_given < p["BUDDY_MAX"] + p["EXPAND_MAX"]: sup.append("expand")
                    else: sup.append("vacation")
                    self.sup_given += 1
                self.pile = OTHERS + sup
                shuffle(self.pile, self.rnd)
            self.bag = ["rank"] * 4 + [self.pile.pop(), self.pile.pop()]
            shuffle(self.bag, self.rnd)
        return self.bag.pop()

# ---------------------------------------------------------------- ゲーム本体 (spec 2章)
class Game:
    def __init__(self, seed, p=P):
        self.p = p; self.dt = 1.0 / p["TPS"]; self.tick = 0; self.t = 0.0
        self.deck = Deck(seed, p); self.rnd = mulberry32(seed + SPAWN_SALT)
        self.rank = 0; self.buddy = 0; self.cap = p["CAP"]; self.expands = 0; self.hats = 0
        self.lane = "E"; self.switch_left = 0.0
        self.enemies = []      # [hp, size, type, hp0, born]  先頭が最も古い
        self.growing = []      # 成長中のリボ払い
        self.blocks = []       # dict(type, hp, maxhp, pass_t)  先頭が最も手前
        self.fill = 0.0; self.budget = 0.0; self.next_block = p["BLOCK_FIRST"]
        self.vac_until = -1.0; self.boss_wave = 0; self.bosses_killed = 0
        self.score = 0.0; self.dead = False; self.got = {}; self.missed = {}
    @property
    def dps(self): return dps_of(self.rank, self.p)
    def spawn_mult(self):
        p = self.p; tau = self.t % p["WAVE"]; calm = p["WAVE"] - p["RUSH_LEN"]
        if tau < calm: return (p["WAVE"] - p["RUSH_LEN"] * p["RUSH_MULT"]) / calm
        return 0.0 if wave_of(self.t, p) % p["BOSS_EVERY"] == 0 else p["RUSH_MULT"]
    def add_enemy(self, hp, size, kind):
        e = [hp, size, kind, hp, self.t]; self.enemies.append(e); self.fill += size
        if kind == "revolving": self.growing.append(e)
    def spawn_group(self):
        ts = unlocked(self.t, self.p); tot = sum(e[4] for e in ts)
        r = self.rnd() * tot
        for e in ts:
            r -= e[4]
            if r <= 0: break
        h = base_hp(self.t, self.p)
        for _ in range(e[5]): self.add_enemy(h * e[1], e[2], e[0])
        return e[2] * e[5]
    def kill(self, e):
        self.fill -= e[1]; self.score += e[1] * wave_of(self.t, self.p) * 10
        if e[2] == "boss":
            self.bosses_killed += 1; self.score += 5000 * self.bosses_killed
    def damage_enemies(self, dmg):
        while dmg > 0 and self.enemies:
            e = self.enemies[0]
            if e[0] <= dmg:
                dmg -= e[0]; e[0] = 0; self.enemies.pop(0); self.kill(e)
            else:
                e[0] -= dmg; dmg = 0
    def apply_block(self, b):
        p = self.p; k = b["type"]
        self.got[k] = self.got.get(k, 0) + 1
        self.score += 100 * wave_of(self.t, p)
        if k == "rank": self.rank += 1
        elif k == "gold": self.rank += p["GOLD_RANKS"]
        elif k == "buddy": self.buddy = min(p["BUDDY_MAX"], self.buddy + 1)
        elif k == "bomb":
            rem = p["BOMB_SIZE"]; keep = []
            for e in self.enemies:
                if e[2] == "boss":
                    e[0] -= e[3] * p["BOMB_BOSS"]
                    if e[0] > 0: keep.append(e)
                    else: self.kill(e)                    # ボムでボスを倒した場合はスコアが入る
                elif rem >= e[1] - 1e-9:
                    rem -= e[1]; e[0] = 0; self.fill -= e[1]   # ボムで消した敵はスコアなし
                else: keep.append(e)
            self.enemies = keep
        elif k == "vacation": self.vac_until = max(self.vac_until, self.t) + p["VACATION"]
        elif k == "expand":
            if self.expands < p["EXPAND_MAX"]: self.expands += 1; self.cap += p["EXPAND"]
        elif k == "trap":
            h = base_hp(self.t, p)
            for _ in range(p["TRAP_COUNT"]): self.add_enemy(h, 1.0, "notice")
        elif k == "hat": self.hats += 1
    def step(self, want):
        """spec 2.7 の処理順"""
        p = self.p; dt = self.dt
        # 1. 入力
        if want != self.lane and self.switch_left <= 0:
            self.lane = want; self.switch_left = p["SWITCH"]
        # 2. ボス
        w = wave_of(self.t, p)
        if w % p["BOSS_EVERY"] == 0 and self.boss_wave != w and self.t % p["WAVE"] >= p["WAVE"] - p["RUSH_LEN"]:
            self.boss_wave = w
            self.add_enemy(p["BOSS_COEF"] * phi(self.t, p) * d_ref(self.t, p), p["BOSS_SIZE"], "boss")
        # 3. 敵の出現
        if self.t >= self.vac_until:
            self.budget += size_rate(self.t, p) * self.spawn_mult() * dt
            while self.budget > 0: self.budget -= self.spawn_group()
        # 4. リボ払いの成長
        if self.growing:
            self.growing = [e for e in self.growing if e[0] > 0 and self.t - e[4] < p["REV_TIME"]]
            for e in self.growing: e[0] += e[3] * p["REV_RATE"] * dt
        # 5. ブロックの出現
        if self.t >= self.next_block:
            k = self.deck.draw(); hp = p["COST"][k] * self.dps
            self.blocks.append(dict(type=k, hp=hp, maxhp=hp, pass_t=self.next_block + p["BLOCK_TRAVEL"]))
            self.next_block += p["BLOCK_INTERVAL"]
        # 6. ブロックの通過
        while self.blocks and self.blocks[0]["pass_t"] <= self.t:
            b = self.blocks.pop(0); self.missed[b["type"]] = self.missed.get(b["type"], 0) + 1
        # 7. 相棒
        if self.buddy: self.damage_enemies(self.dps * p["BUDDY_DPS"] * self.buddy * dt)
        # 8. プレイヤー
        if self.switch_left > 0: self.switch_left -= dt
        elif self.lane == "E": self.damage_enemies(self.dps * dt)
        elif self.blocks:
            b = self.blocks[0]; b["hp"] -= self.dps * dt
            if b["hp"] <= 0: self.blocks.pop(0); self.apply_block(b)
        # 9. 時間  (足し込まず、刻み数から求める)
        self.tick += 1; self.t = self.tick / p["TPS"]
        # 10. 終了判定
        if self.fill >= self.cap - 1e-9: self.dead = True

# ---------------------------------------------------------------- ボット (spec 5章, 9.1)
class Bot:
    lo = 0.3; hi = 0.6; interval = 0.5; avoid = 1.0; check = False; lapse = 0.0
    def __init__(self, seed): self.rnd = mulberry32(seed + BOT_SALT); self.next = 0.0; self.want = "E"
    def act(self, g):
        if g.t >= self.next - 1e-9:
            self.next += self.interval
            if self.rnd() >= self.lapse: self.want = self.decide(g)
        return self.want
    def wanted(self, g):
        if not g.blocks: return False
        b = g.blocks[0]; k = b["type"]
        if k in ("trap", "hat") and self.rnd() < self.avoid: return False
        if self.check:
            if k == "bomb" and g.fill < 25: return False
            need = b["hp"] / g.dps + (g.p["SWITCH"] if g.lane == "E" else 0)
            if need > b["pass_t"] - g.t - 0.1: return False
            if g.fill + size_rate(g.t, g.p) * need > 0.92 * g.cap: return False
        return True
    def decide(self, g):
        f = g.fill / g.cap
        if not self.wanted(g): return "E"
        if self.want == "B": return "E" if f > self.hi else "B"
        return "B" if f < self.lo else "E"

class EnemyOnly(Bot):
    def decide(self, g): return "E"
class BlockOnly(Bot):
    def decide(self, g): return "B"
class Demo(Bot):
    interval = 0.3
    def decide(self, g):
        f = g.fill / g.cap
        if not g.blocks: return "B" if f < 0.20 else "E"                                   # 規則1
        b = g.blocks[0]; k = b["type"]
        if g.rank == 0 and k == "rank" and not g.missed.get("rank"): return "B"            # 規則2
        if k in ("trap", "hat"): return "B"                                                # 規則3
        if k == "bomb": return "E"                                                         # 規則4
        if b["hp"] / b["maxhp"] < 0.12: return "E"                                         # 規則5
        if f > 0.75: return "B" if self.rnd() < 0.5 else "E"                               # 規則6
        return "B" if f < 0.45 else "E"                                                    # 規則7
class Timid(Bot):  lo = 0.10; hi = 0.35; interval = 0.8;  avoid = 0.5; lapse = 0.15
class Casual(Bot): lo = 0.30; hi = 0.60; interval = 0.6;  avoid = 0.8; lapse = 0.08
class Good(Bot):   lo = 0.50; hi = 0.75; interval = 0.35; avoid = 1.0; lapse = 0.03; check = True
class Expert(Bot): lo = 0.80; hi = 0.95; interval = 0.15; avoid = 1.0; lapse = 0.0;  check = True

BOTS = dict(demo=Demo, enemy_only=EnemyOnly, block_only=BlockOnly, timid=Timid, casual=Casual, good=Good, expert=Expert)
# spec 9.2 の合格範囲 (生存時間の中央値, 秒)
PASS = dict(demo=(65, 95), enemy_only=(85, 105), block_only=(25, 60), timid=(150, 210), casual=(225, 305), good=(280, 355), expert=(300, 395))

def run(bot_name, seed, p=P, tmax=1500.0):
    g = Game(seed, p); b = BOTS[bot_name](seed)
    while not g.dead and g.t < tmax: g.step(b.act(g))
    return dict(t=g.t, rank=g.rank, wave=wave_of(g.t, p), score=g.score, got=g.got, missed=g.missed)

def _job(a): return run(*a)
def batch(bot_name, n=100, p=P, pool=None):
    args = [(bot_name, s, p) for s in range(n)]
    return pool.map(_job, args) if pool else [run(*a) for a in args]

def stats(rs):
    ts = sorted(r["t"] for r in rs); n = len(ts)
    return dict(min=ts[0], p10=ts[n // 10], med=statistics.median(ts), p90=ts[n - n // 10 - 1], max=ts[-1],
                rank=statistics.mean(r["rank"] for r in rs), wave=statistics.median(r["wave"] for r in rs),
                score=statistics.median(r["score"] for r in rs))

def main_table(pool, n=100):
    out = {}; ok = True
    print(f"{'bot':11s} {'min':>5s} {'p10':>5s} {'med':>5s} {'p90':>5s} {'max':>5s} {'rank':>5s} {'wave':>4s} {'score':>8s}  判定")
    for name in BOTS:
        rs = batch(name, n, P, pool); s = stats(rs); out[name] = s; lo, hi = PASS[name]
        good = lo <= s["med"] <= hi; ok &= good
        print(f"{name:11s} {s['min']:5.0f} {s['p10']:5.0f} {s['med']:5.0f} {s['p90']:5.0f} {s['max']:5.0f} {s['rank']:5.1f} {s['wave']:4.0f} {s['score']:8.0f}  {'OK' if good else 'NG'} ({lo}-{hi})")
        if name == "demo":
            inr = sum(55 <= r["t"] <= 100 for r in rs); print(f"            demo が 55-100 秒で終わった回数: {inr}/{n}"); ok &= inr >= 0.9 * n
    order = out["timid"]["med"] < out["casual"]["med"] < out["good"]["med"] <= out["expert"]["med"]
    longest = max(s["max"] for s in out.values())
    print(f"順序 timid<casual<good<=expert: {'OK' if order else 'NG'} / 最長 {longest:.0f} 秒 (<540): {'OK' if longest < 540 else 'NG'}")
    print("総合:", "合格" if ok and order and longest < 540 else "不合格")
    return out

def golden(pool):
    first5 = lambda seed: (lambda r: [r() for _ in range(5)])(mulberry32(seed))
    g = dict(
        note="単体テスト用の期待値。mulberry32 と deck は完全一致、formulas/boss/dps は相対誤差 1e-9 以内で一致すること。sim_reference は参考値(完全一致は求めない)。",
        mulberry32={"0": first5(0), "12345": first5(12345)},
        formulas=[dict(t=t, wave=wave_of(t, P), phi=phi(t, P), d_ref=d_ref(t, P), size_rate=size_rate(t, P), base_hp=base_hp(t, P))
                  for t in (0, 30, 60, 120, 180, 240, 300, 360, 420)],
        boss=[dict(wave=w, t=w * 20 - 5, hp=P["BOSS_COEF"] * phi(w * 20 - 5, P) * d_ref(w * 20 - 5, P)) for w in (5, 10, 15, 20)],
        dps=[dict(rank=r, dps=dps_of(r, P)) for r in (0, 1, 10, 30, 60)],
        deck={str(seed): (lambda d: [d.draw() for _ in range(61)])(Deck(seed, P)) for seed in (0, 1, 2, 42)},
        sim_reference={},
    )
    for name in BOTS:
        rs = batch(name, 100, P, pool); s_ = stats(rs)
        g["sim_reference"][name] = dict(median=round(s_["med"], 2), p10=round(s_["p10"], 2), p90=round(s_["p90"], 2), max=round(s_["max"], 2),
                                        pass_range=list(PASS[name]), first10_seeds=[round(r["t"], 2) for r in rs[:10]])
    return g

if __name__ == "__main__":
    with Pool() as pool:
        if "--golden" in sys.argv:
            json.dump(golden(pool), open("golden.json", "w"), ensure_ascii=False, indent=1); print("golden.json を書き出しました")
        elif "--knobs" in sys.argv:
            import copy
            def variant(**kw):
                p = copy.deepcopy(P)
                for k, v in kw.items():
                    if k == "COST": p["COST"].update(v)
                    else: p[k] = v
                return p
            for label, kw in [("確定値", {}), ("KAPPA=0.0029", dict(KAPPA=0.0029)), ("KAPPA=0.0039", dict(KAPPA=0.0039)),
                              ("PHI0=0.27", dict(PHI0=0.27)), ("PHI0=0.33", dict(PHI0=0.33)),
                              ("rank=3.0", dict(COST=dict(rank=3.0))), ("rank=4.0", dict(COST=dict(rank=4.0))),
                              ("CAP=80", dict(CAP=80.0)), ("CAP=120", dict(CAP=120.0)), ("G=1.15", dict(G=1.15)), ("G=1.25", dict(G=1.25))]:
                p = variant(**kw)
                print(f"{label:14s} " + "  ".join(f"{b}={stats(batch(b, 100, p, pool))['med']:.0f}" for b in ("timid", "casual", "good", "expert")), flush=True)
        else:
            main_table(pool)
