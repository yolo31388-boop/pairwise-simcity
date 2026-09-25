"""模拟城市引擎（已修复）。

修复列表：
1. 拆除退还资源
2. 满意度按建筑与商业区距离计算
3. 低满意度居民搬走，不再交税
4. 电力/水资源按覆盖范围供给
5. 升级进度累积保存，资源中断不丢失
6. 增量更新只重算受影响区域
"""
from dataclasses import dataclass, field
from typing import Dict, List, Tuple
import copy
import math


# 覆盖范围（地图单位），地图大小不变
POWER_RANGE = 10.0
WATER_RANGE = 10.0
# 满意度低于该阈值时居民搬走
MOVE_OUT_THRESHOLD = 30
# 每个未搬走居民每天缴纳的税
TAX_PER_CITIZEN = 10


@dataclass
class Building:
    bid: str
    name: str
    btype: str  # residential, commercial, power, water
    x: int
    y: int
    level: int = 1
    upgrade_progress: float = 0.0


@dataclass
class Citizen:
    cid: str
    satisfaction: int = 50
    moved: bool = False


@dataclass
class CityState:
    buildings: List[Building] = field(default_factory=list)
    citizens: List[Citizen] = field(default_factory=list)
    money: int = 10000
    power: int = 100
    water: int = 100
    day: int = 1


def _distance(x1: int, y1: int, x2: int, y2: int) -> float:
    return math.hypot(x1 - x2, y1 - y2)


class CityEngine:
    def __init__(self):
        self.state = CityState()
        # 记录每栋建筑的建造成本，用于拆除退还
        self._building_costs: Dict[str, int] = {}
        # 满意度缓存：bid -> 该住宅的满意度得分，支持增量更新
        self._satisfaction_cache: Dict[str, float] = {}

    def add_building(self, b: Building, cost: int):
        """建造并扣费，记录成本供拆除退还。"""
        s = self.state
        s.money -= cost
        s.buildings.append(b)
        self._building_costs[b.bid] = cost

    def demolish(self, building_id: str):
        """拆除并退还建造费用。"""
        s = self.state
        target = next((b for b in s.buildings if b.bid == building_id), None)
        if target is None:
            return
        s.buildings = [b for b in s.buildings if b.bid != building_id]
        s.money += self._building_costs.pop(building_id, 0)
        self._satisfaction_cache.pop(building_id, None)

    def _residential_score(self, r: Building, commercial: List[Building]) -> float:
        """单个住宅满意度：离最近商业区越近越高。"""
        if not commercial:
            return 0.0
        d = min(_distance(r.x, r.y, c.x, c.y) for c in commercial)
        return max(0.0, 100.0 - d)

    def calculate_satisfaction(self) -> float:
        """计算满意度：按住宅到最近商业区的距离逐栋计算后取平均。"""
        s = self.state
        residential = [b for b in s.buildings if b.btype == "residential"]
        commercial = [b for b in s.buildings if b.btype == "commercial"]
        if not residential:
            return 0.0
        for r in residential:
            self._satisfaction_cache[r.bid] = self._residential_score(r, commercial)
        return min(100.0, sum(self._satisfaction_cache[r.bid] for r in residential) / len(residential))

    def daily_update(self):
        """每日更新：结算满意度、收税，低满意度居民搬走且不再交税。"""
        s = self.state
        s.day += 1
        satisfaction = self.calculate_satisfaction()
        for c in s.citizens:
            c.satisfaction = int(satisfaction)
            if c.satisfaction < MOVE_OUT_THRESHOLD:
                c.moved = True
            else:
                s.money += TAX_PER_CITIZEN

    def get_power_coverage(self, x: int, y: int) -> bool:
        """电力覆盖：必须在某座发电厂覆盖范围内且电网有电。"""
        s = self.state
        if s.power <= 0:
            return False
        return any(
            _distance(x, y, b.x, b.y) <= POWER_RANGE
            for b in s.buildings
            if b.btype == "power"
        )

    def get_water_coverage(self, x: int, y: int) -> bool:
        """水资源覆盖：必须在某座水厂覆盖范围内且供水充足。"""
        s = self.state
        if s.water <= 0:
            return False
        return any(
            _distance(x, y, b.x, b.y) <= WATER_RANGE
            for b in s.buildings
            if b.btype == "water"
        )

    def upgrade_building(self, building_id: str, progress: float):
        """升级：累积进度并保存；进度满 1.0 才升级，余量保留到下一级。"""
        s = self.state
        for b in s.buildings:
            if b.bid == building_id:
                b.upgrade_progress += progress
                while b.upgrade_progress >= 1.0:
                    b.upgrade_progress -= 1.0
                    b.level += 1
                return

    def incremental_update(self, affected_area: Tuple[int, int, int, int]):
        """增量更新：只重算受影响区域内的住宅满意度，区域外沿用缓存。"""
        x1, y1, x2, y2 = affected_area
        s = self.state
        commercial = [b for b in s.buildings if b.btype == "commercial"]
        affected = [
            b for b in s.buildings
            if b.btype == "residential" and x1 <= b.x <= x2 and y1 <= b.y <= y2
        ]
        for r in affected:
            self._satisfaction_cache[r.bid] = self._residential_score(r, commercial)
        if not affected:
            return 0.0
        return min(100.0, sum(self._satisfaction_cache[r.bid] for r in affected) / len(affected))

    def snapshot(self):
        return copy.deepcopy(self.state)
