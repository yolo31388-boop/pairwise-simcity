"""模拟城市引擎（带 bug）。

Bug 列表：
1. 拆除不退还资源
2. 满意度只看数量，不看距离
3. 低满意度居民不搬走
4. 资源全局共享，无覆盖范围
5. 升级进度丢失
6. 无增量更新
"""
from dataclasses import dataclass, field
from typing import List, Dict, Set, Tuple
import copy


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


class CityEngine:
    def __init__(self):
        self.state = CityState()

    def add_building(self, b: Building, cost: int):
        """建造（BUG: 拆除不退还，但这里先扣）。"""
        s = self.state
        s.money -= cost
        s.buildings.append(b)

    def demolish(self, building_id: str):
        """拆除（BUG: 不退还资源）。"""
        s = self.state
        s.buildings = [b for b in s.buildings if b.bid != building_id]
        # BUG: 不退还建造费用

    def calculate_satisfaction(self) -> float:
        """计算满意度（BUG: 只看数量，不看距离）。"""
        s = self.state
        residential = [b for b in s.buildings if b.btype == "residential"]
        commercial = [b for b in s.buildings if b.btype == "commercial"]
        # BUG: 只看数量，不看距离
        if not residential:
            return 0.0
        return min(100.0, len(commercial) * 10.0)

    def daily_update(self):
        """每日更新（BUG: 低满意度不搬走）。"""
        s = self.state
        s.day += 1
        satisfaction = self.calculate_satisfaction()
        for c in s.citizens:
            c.satisfaction = int(satisfaction)
            # BUG: 低满意度不搬走

    def get_power_coverage(self, x: int, y: int) -> bool:
        """电力覆盖（BUG: 全局共享）。"""
        s = self.state
        power_plants = [b for b in s.buildings if b.btype == "power"]
        # BUG: 不看距离，全局覆盖
        return len(power_plants) > 0

    def upgrade_building(self, building_id: str, progress: float):
        """升级（BUG: 进度丢失）。"""
        s = self.state
        for b in s.buildings:
            if b.bid == building_id:
                # BUG: 直接完成，不累积进度
                b.upgrade_progress = 1.0
                b.level += 1

    def incremental_update(self, affected_area: Tuple[int, int, int, int]):
        """增量更新（BUG: 全图重算）。"""
        # BUG: 忽略 affected_area，全图重算
        return self.calculate_satisfaction()

    def snapshot(self):
        return copy.deepcopy(self.state)
