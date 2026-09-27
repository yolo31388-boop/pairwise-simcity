// 资源状态 - 增量累加、原子事务、容量截断、完整日志
class ResourceState {
  constructor(initial = { gold: 100, wood: 50, food: 30 }, capacity = Infinity) {
    this.resources = { ...initial };
    this.capacity = capacity; // 数字（统一上限）或 { type: cap }
    this.log = [];
  }

  get(type) {
    return this.resources[type] || 0;
  }

  capacityFor(type) {
    if (typeof this.capacity === 'number') return this.capacity;
    return this.capacity[type] ?? Infinity;
  }

  add(type, amount, source = 'system') {
    if (!Number.isFinite(amount) || amount === 0) return;
    // 增量累加，绝不覆盖
    this.resources[type] = this.get(type) + amount;
    this.log.push({ action: 'add', type, amount, source });
  }

  canAfford(costs) {
    return Object.entries(costs).every(([type, amount]) => this.get(type) >= amount);
  }

  consume(type, amount, source = 'system') {
    if (!Number.isFinite(amount) || amount < 0) return false;
    if (this.get(type) < amount) return false; // 存量不足，拒绝扣除
    this.resources[type] = this.get(type) - amount;
    this.log.push({ action: 'consume', type, amount, source });
    return true;
  }

  // 原子事务：先校验所有类型净额非负，再统一应用；任一失败则整体不生效
  transact(ops) {
    const net = {};
    for (const op of ops) {
      const signed = op.action === 'consume' ? -op.amount : op.amount;
      net[op.type] = (net[op.type] || 0) + signed;
    }
    for (const [type, delta] of Object.entries(net)) {
      if (this.get(type) + delta < 0) return false;
    }
    // 先应用全部产出，再应用全部消耗，中间状态对外不可见
    for (const op of ops) {
      if (op.action !== 'consume') this.add(op.type, op.amount, op.source);
    }
    for (const op of ops) {
      if (op.action === 'consume') this.consume(op.type, op.amount, op.source);
    }
    return true;
  }

  // 结算结束时统一按仓库容量截断
  clampToCapacity(source = 'capacity') {
    for (const type of Object.keys(this.resources)) {
      const cap = this.capacityFor(type);
      const value = this.get(type);
      if (value > cap) {
        this.resources[type] = cap;
        this.log.push({ action: 'truncate', type, amount: value - cap, source });
      }
    }
  }
}

module.exports = { ResourceState };
