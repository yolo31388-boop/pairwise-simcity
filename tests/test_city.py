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
