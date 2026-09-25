"""模拟城市引擎（已修复）。

修复列表：
1. 拆除退还资源（建造成本记录在建筑上，拆除时全额退还）
2. 满意度按居民区到商业区的距离计算
3. 满意度低于阈值的居民搬走，且搬走当天不再缴税
4. 电力/水资源有覆盖范围，超出范围的建筑用不上
5. 升级进度累积保存在建筑上，资源中断不丢失
6. 支持增量更新：只重算受影响区域内的建筑满意度
"""
from dataclasses import dataclass, field
from typing import Dict, List, Tuple
import copy
import math


# 覆盖范围（地图单位），建筑类型与资源种类保持不变
POWER_RANGE = 10.0
WATER_RANGE = 10.0
# 满意度低于该阈值时居民搬走
MOVE_THRESHOLD = 30
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
    cost: int = 0


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
        # 每个住宅建筑的满意度缓存，用于增量更新
        self._sat_cache: Dict[str, float] = {}

    def add_building(self, b: Building, cost: int) -> bool:
        """建造。资金不足时拒绝建造（边界：零资金）。"""
        s = self.state
        if s.money < cost:
            return False
        s.money -= cost
        b.cost = cost
        s.buildings.append(b)
        return True

    def demolish(self, building_id: str) -> bool:
        """拆除并退还建造费用。"""
        s = self.state
        target = next((b for b in s.buildings if b.bid == building_id), None)
        if target is None:
            return False
        s.buildings.remove(target)
        s.money += target.cost
        self._sat_cache.pop(building_id, None)
        return True

    def _residential_satisfaction(self, r: Building, commercial: List[Building]) -> float:
        """单个住宅的满意度：离最近商业区越近越高。"""
        if not commercial:
            return 0.0
        nearest = min(_distance(r.x, r.y, c.x, c.y) for c in commercial)
        return max(0.0, min(100.0, 100.0 - nearest))

    def calculate_satisfaction(self) -> float:
        """计算全城满意度（按距离），并刷新缓存。"""
        s = self.state
        residential = [b for b in s.buildings if b.btype == "residential"]
        if not residential:
            self._sat_cache.clear()
            return 0.0
        commercial = [b for b in s.buildings if b.btype == "commercial"]
        for r in residential:
            self._sat_cache[r.bid] = self._residential_satisfaction(r, commercial)
        return sum(self._sat_cache[b.bid] for b in residential) / len(residential)

    def daily_update(self):
        """每日更新：收税；满意度低于阈值的居民搬走且当天不缴税。"""
        s = self.state
        s.day += 1
        satisfaction = self.calculate_satisfaction()
        for c in s.citizens:
            if c.moved:
                continue  # 已搬走的居民不再参与更新和缴税
            c.satisfaction = int(satisfaction)
            if c.satisfaction < MOVE_THRESHOLD:
                c.moved = True
            else:
                s.money += TAX_PER_CITIZEN

    def _in_coverage(self, btype: str, x: int, y: int, radius: float) -> bool:
        return any(
            _distance(b.x, b.y, x, y) <= radius
            for b in self.state.buildings
            if b.btype == btype
        )

    def get_power_coverage(self, x: int, y: int) -> bool:
        """电力覆盖：必须在某个发电厂覆盖范围内且全城有电力余量。"""
        if self.state.power <= 0:
            return False
        return self._in_coverage("power", x, y, POWER_RANGE)

    def get_water_coverage(self, x: int, y: int) -> bool:
        """水资源覆盖：必须在某个水厂覆盖范围内且全城有水资源余量。"""
        if self.state.water <= 0:
            return False
        return self._in_coverage("water", x, y, WATER_RANGE)

    def upgrade_building(self, building_id: str, progress: float):
        """升级：进度累积保存在建筑上，满 1.0 才升一级，溢出部分保留。"""
        for b in self.state.buildings:
            if b.bid == building_id:
                b.upgrade_progress += progress
                while b.upgrade_progress >= 1.0:
                    b.upgrade_progress -= 1.0
                    b.level += 1
                return

    def incremental_update(self, affected_area: Tuple[int, int, int, int]) -> float:
        """增量更新：只重算受影响区域 (x0, y0, x1, y1) 内的住宅满意度。"""
        x0, y0, x1, y1 = affected_area
        s = self.state
        residential = [b for b in s.buildings if b.btype == "residential"]
        commercial = [b for b in s.buildings if b.btype == "commercial"]
        # 清理已拆除建筑的缓存
        valid = {b.bid for b in residential}
        self._sat_cache = {k: v for k, v in self._sat_cache.items() if k in valid}
        for r in residential:
            in_area = x0 <= r.x <= x1 and y0 <= r.y <= y1
            if in_area or r.bid not in self._sat_cache:
                self._sat_cache[r.bid] = self._residential_satisfaction(r, commercial)
        if not residential:
            return 0.0
        return sum(self._sat_cache[b.bid] for b in residential) / len(residential)

    def snapshot(self):
        return copy.deepcopy(self.state)
