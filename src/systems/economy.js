const { ResourceState } = require('../state/resource.js');

class EconomySystem {
  constructor(options = {}) {
    this.resources = new ResourceState(options.initial, options.capacity ?? Infinity);
    this.buildings = [];
    this.tickSeconds = options.tickSeconds ?? 1; // 一个 tick 代表的真实秒数
  }

  // 同一 tick 内所有建筑产出（及可选消耗）在同一事务中结算，结束后统一容量截断
  tick(costs = null) {
    const ops = [];
    for (const b of this.buildings) {
      const output = b.getOutput();
      for (const [type, amount] of Object.entries(output)) {
        if (amount !== 0) ops.push({ action: 'add', type, amount, source: `building:${b.type}` });
      }
    }
    if (costs) {
      for (const [type, amount] of Object.entries(costs)) {
        ops.push({ action: 'consume', type, amount, source: 'tick-cost' });
      }
    }
    const ok = this.resources.transact(ops);
    if (ok) this.resources.clampToCapacity();
    return ok;
  }

  // 消耗前整体校验存量，不足则原子失败，不做任何扣减
  consumeResources(costs) {
    if (!this.resources.canAfford(costs)) return false;
    for (const [type, amount] of Object.entries(costs)) {
      this.resources.consume(type, amount, 'consumeResources');
    }
    return true;
  }

  // 离线收益：按真实经过时间（秒）和建筑当前等级结算
  settleOffline(elapsedSeconds) {
    const ticks = elapsedSeconds / this.tickSeconds;
    const ops = [];
    for (const b of this.buildings) {
      const output = b.getOutput();
      for (const [type, amount] of Object.entries(output)) {
        if (amount !== 0) {
          ops.push({ action: 'add', type, amount: amount * ticks, source: `offline:${b.type}` });
        }
      }
    }
    const ok = this.resources.transact(ops);
    if (ok) this.resources.clampToCapacity();
    return ok;
  }
}

module.exports = { EconomySystem };
