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
        e.state.water = 0
        e.add_building(Building(bid="w1", name="Water", btype="water", x=0, y=0), 1000)
        assert e.get_water_coverage(0, 0) is False


class TestUpgradeAccumulation:
    def test_upgrade_completes_after_accumulation(self):
        """进度累积到 1.0 才升级，余量保留。"""
        e = CityEngine()
        e.add_building(Building(bid="b1", name="H", btype="residential", x=0, y=0), 100)
        e.upgrade_building("b1", 0.5)
        e.upgrade_building("b1", 0.6)
        b = e.state.buildings[0]
        assert b.level == 2
        assert abs(b.upgrade_progress - 0.1) < 1e-9

    def test_upgrade_progress_not_lost_when_interrupted(self):
        """资源被其他建筑占用后，已有进度不丢失。"""
        e = CityEngine()
        e.add_building(Building(bid="b1", name="H", btype="residential", x=0, y=0), 100)
        e.upgrade_building("b1", 0.5)
        # 模拟资源被其他建筑占用：本次没有推进任何进度
        e.upgrade_building("b1", 0.0)
        assert e.state.buildings[0].upgrade_progress == 0.5
        assert e.state.buildings[0].level == 1


class TestIncrementalIsolation:
    def test_incremental_only_affects_area(self):
        """增量更新只重算受影响区域，区域外沿用缓存。"""
        e = CityEngine()
        e.add_building(Building(bid="r1", name="R1", btype="residential", x=0, y=0), 100)
        e.add_building(Building(bid="r2", name="R2", btype="residential", x=50, y=50), 100)
        e.add_building(Building(bid="c1", name="C", btype="commercial", x=1, y=1), 100)
        e.calculate_satisfaction()
        cached_r2 = e._satisfaction_cache["r2"]
        # 在 (50,50) 附近新增商业区，但只增量更新 (0,0) 附近
        e.add_building(Building(bid="c2", name="C2", btype="commercial", x=51, y=51), 100)
        result = e.incremental_update((0, 0, 2, 2))
        assert isinstance(result, float)
        # r2 不在受影响区域，缓存不应被重算
        assert e._satisfaction_cache["r2"] == cached_r2


class TestDemolishEdge:
    def test_demolish_nonexistent_is_noop(self):
        e = CityEngine()
        money_before = e.state.money
        e.demolish("nope")
        assert e.state.money == money_before
        assert e.state.buildings == []


class TestTax:
    def test_moved_citizen_pays_no_tax(self):
        """低满意度居民搬走，不再交税。"""
        e = CityEngine()
        e.state.citizens.append(Citizen(cid="c1", satisfaction=10))
        money_before = e.state.money
        e.daily_update()
        assert e.state.citizens[0].moved is True
        assert e.state.money == money_before  # 没有收到税

    def test_happy_citizen_pays_tax(self):
        """高满意度居民正常交税。"""
        e = CityEngine()
        e.add_building(Building(bid="r1", name="R", btype="residential", x=0, y=0), 100)
        e.add_building(Building(bid="c1", name="C", btype="commercial", x=1, y=1), 100)
        e.state.citizens.append(Citizen(cid="c1"))
        money_before = e.state.money
        e.daily_update()
        assert e.state.citizens[0].moved is False
        assert e.state.money > money_before
