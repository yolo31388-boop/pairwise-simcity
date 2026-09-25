"""模拟城市测试（红态）。"""
import pytest
from game.city import CityEngine, Building, Citizen


class TestDemolishRefund:
    def test_demolish_refunds(self):
        """拆除应该退还资源。"""
        e = CityEngine()
        b = Building(bid="b1", name="House", btype="residential", x=0, y=0)
        money_before = e.state.money
        e.add_building(b, 500)
        assert e.state.money == money_before - 500
        e.demolish("b1")
        assert e.state.money > money_before - 500  # 应该退还一部分


class TestSatisfactionDistance:
    def test_satisfaction_by_distance(self):
        """满意度应该看距离。"""
        e = CityEngine()
        e.add_building(Building(bid="r1", name="R", btype="residential", x=0, y=0), 100)
        e.add_building(Building(bid="c1", name="C", btype="commercial", x=100, y=100), 100)
        sat_far = e.calculate_satisfaction()
        e2 = CityEngine()
        e2.add_building(Building(bid="r1", name="R", btype="residential", x=0, y=0), 100)
        e2.add_building(Building(bid="c1", name="C", btype="commercial", x=1, y=1), 100)
        sat_near = e2.calculate_satisfaction()
        # 近的应该满意度更高
        assert sat_near >= sat_far


class TestCitizenMove:
    def test_low_satisfaction_moves(self):
        """低满意度居民应该搬走。"""
        e = CityEngine()
        e.state.citizens.append(Citizen(cid="c1", satisfaction=10))
        e.daily_update()
        assert e.state.citizens[0].moved is True or len(e.state.citizens) == 0


class TestPowerCoverage:
    def test_power_has_range(self):
        """电力应该有覆盖范围。"""
        e = CityEngine()
        e.add_building(Building(bid="p1", name="Plant", btype="power", x=0, y=0), 1000)
        # 近处应该有电
        assert e.get_power_coverage(1, 1) is True
        # 远处应该没电
        assert e.get_power_coverage(100, 100) is False


class TestUpgradeProgress:
    def test_upgrade_progress_saved(self):
        """升级进度应该保存。"""
        e = CityEngine()
        e.add_building(Building(bid="b1", name="H", btype="residential", x=0, y=0), 100)
        e.upgrade_building("b1", 0.5)
        assert e.state.buildings[0].upgrade_progress == 0.5  # 不应该直接完成


class TestIncremental:
    def test_incremental_update(self):
        """应该支持增量更新。"""
        e = CityEngine()
        e.add_building(Building(bid="r1", name="R", btype="residential", x=0, y=0), 100)
        e.add_building(Building(bid="c1", name="C", btype="commercial", x=1, y=1), 100)
        # 只更新 (0,0) 附近
        result = e.incremental_update((0, 0, 2, 2))
        assert isinstance(result, float)


class TestBoundary:
    def test_zero_money(self):
        e = CityEngine()
        e.state.money = 0
        b = Building(bid="b1", name="H", btype="residential", x=0, y=0)
        e.add_building(b, 500)
        assert e.state.money < 0 or e.state.money == 0

    def test_zero_power(self):
        e = CityEngine()
        e.state.power = 0
        assert e.get_power_coverage(0, 0) is False

    def test_full_satisfaction(self):
        e = CityEngine()
        for i in range(10):
            e.add_building(Building(bid=f"c{i}", name=f"C{i}", btype="commercial", x=i, y=0), 100)
        e.add_building(Building(bid="r1", name="R", btype="residential", x=0, y=0), 100)
        sat = e.calculate_satisfaction()
        assert sat <= 100


class TestWaterCoverage:
    def test_water_has_range(self):
        """水资源应该有覆盖范围。"""
        e = CityEngine()
        e.add_building(Building(bid="w1", name="Water", btype="water", x=0, y=0), 1000)
        assert e.get_water_coverage(1, 1) is True
        assert e.get_water_coverage(100, 100) is False

    def test_zero_water(self):
        e = CityEngine()
        e.add_building(Building(bid="w1", name="Water", btype="water", x=0, y=0), 1000)
        e.state.water = 0
        assert e.get_water_coverage(0, 0) is False


class TestTax:
    def test_moved_citizen_pays_no_tax(self):
        """低满意度居民搬走，当天不缴税。"""
        e = CityEngine()
        e.state.citizens.append(Citizen(cid="c1", satisfaction=10))
        money_before = e.state.money
        e.daily_update()
        assert e.state.citizens[0].moved is True
        assert e.state.money == money_before  # 没收到税

    def test_happy_citizen_pays_tax(self):
        """高满意度居民留下并缴税。"""
        e = CityEngine()
        e.add_building(Building(bid="r1", name="R", btype="residential", x=0, y=0), 100)
        e.add_building(Building(bid="c1", name="C", btype="commercial", x=1, y=1), 100)
        e.state.citizens.append(Citizen(cid="c1"))
        money_before = e.state.money
        e.daily_update()
        assert len(e.state.citizens) == 1
        assert e.state.money > money_before  # 收到税


class TestIncrementalScope:
    def test_incremental_only_recomputes_affected_area(self):
        """增量更新只重算受影响区域，区域外保持缓存值。"""
        e = CityEngine()
        e.add_building(Building(bid="r1", name="R1", btype="residential", x=0, y=0), 100)
        e.add_building(Building(bid="r2", name="R2", btype="residential", x=50, y=50), 100)
        c1 = Building(bid="c1", name="C", btype="commercial", x=1, y=1)
        e.add_building(c1, 100)
        e.calculate_satisfaction()  # 建立缓存
        # 直接把商业区搬到 r2 旁边（不触发任何通知）
        c1.x, c1.y = 49, 49
        result = e.incremental_update((40, 40, 60, 60))
        # r2 被重算（变高），r1 保持缓存值（不因为 c1 搬走而下降）
        full = e.calculate_satisfaction()
        assert result > full  # 全图重算会拉低 r1，增量不会
        assert e._sat_cache["r2"] > e._sat_cache["r1"]


class TestUpgradeAccumulation:
    def test_upgrade_accumulates_across_calls(self):
        """多次投入进度应累积，资源中断不丢失。"""
        e = CityEngine()
        e.add_building(Building(bid="b1", name="H", btype="residential", x=0, y=0), 100)
        e.upgrade_building("b1", 0.4)
        e.upgrade_building("b1", 0.4)
        assert e.state.buildings[0].level == 1
        assert abs(e.state.buildings[0].upgrade_progress - 0.8) < 1e-9
        e.upgrade_building("b1", 0.5)
        assert e.state.buildings[0].level == 2
        assert abs(e.state.buildings[0].upgrade_progress - 0.3) < 1e-9
