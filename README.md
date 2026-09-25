# pairwise-simcity

模拟城市引擎。建筑类型（residential / commercial / power / water）、资源种类（money / power / water）与地图模型保持不变。

已修复的问题：
1. 拆除建筑时按建造成本退还资金（成本记录在 `Building.cost`）
2. 满意度按住宅区到最近商业区的距离计算，越近越高
3. 满意度低于阈值（30）的居民搬走（`moved=True`），搬走当天起不再缴税
4. 电力 / 水资源有覆盖范围（10 个地图单位），超出范围或资源余量为零时不可用
5. 升级进度累积保存在 `Building.upgrade_progress`，满 1.0 升一级，溢出保留
6. `incremental_update` 只重算受影响区域内的住宅满意度，区域外使用缓存

运行测试：

```bash
python3 -m pytest tests/ -q
```
