'use strict';

const BALANCE_EPSILON = 1e-9;

const DEFAULT_RESOURCES = { gold: 100, wood: 50, food: 30 };

function assertAmount(amount) {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) {
    throw new TypeError(`resource amount must be a finite number, got ${amount}`);
  }
  if (amount < 0) {
    throw new RangeError(`resource amount must be non-negative, got ${amount}`);
  }
}

// 资源状态：增量累加 + 事务内工作副本，保证非负、原子提交、日志完整。
class ResourceState {
  constructor(initial = DEFAULT_RESOURCES) {
    this.resources = { ...initial };
    this.capacities = {};
    this.log = [];
    this._tx = null;
  }

  get(type) {
    const view = this._tx ? this._tx.working : this.resources;
    return view[type] ?? 0;
  }

  snapshot() {
    const view = this._tx ? this._tx.working : this.resources;
    return { ...view };
  }

  setCapacity(type, capacity) {
    if (typeof capacity !== 'number' || !Number.isFinite(capacity) || capacity < 0) {
      throw new RangeError(`capacity must be a non-negative finite number, got ${capacity}`);
    }
    this.capacities[type] = capacity;
  }

  getCapacity(type) {
    return this.capacities[type] ?? Infinity;
  }

  get inTransaction() {
    return this._tx !== null;
  }

  beginTransaction(meta = {}) {
    if (this._tx) {
      throw new Error('a resource transaction is already active');
    }
    this._tx = { working: { ...this.resources }, entries: [], meta: { ...meta } };
  }

  _target() {
    if (this._tx) {
      return { view: this._tx.working, entries: this._tx.entries, meta: this._tx.meta };
    }
    return { view: this.resources, entries: this.log, meta: {} };
  }

  produce(type, amount, source = 'external') {
    assertAmount(amount);
    if (amount === 0) return true;
    const { view, entries, meta } = this._target();
    // 增量累加，绝不在此做仓库截断（截断只能发生在结算结束时）。
    view[type] = (view[type] ?? 0) + amount;
    entries.push({
      action: 'produce',
      type,
      amount,
      source,
      balance: view[type],
      tick: meta.tick ?? null,
    });
    return true;
  }

  // 向后兼容旧调用名，语义与 produce 相同（增量累加）。
  add(type, amount, source) {
    return this.produce(type, amount, source ?? 'add');
  }

  canAfford(costs) {
    const view = this._tx ? this._tx.working : this.resources;
    for (const [type, amount] of Object.entries(costs)) {
      assertAmount(amount);
      if ((view[type] ?? 0) + BALANCE_EPSILON < amount) return false;
    }
    return true;
  }

  consume(type, amount, source = 'external') {
    assertAmount(amount);
    if (amount === 0) return true;
    const { view, entries, meta } = this._target();
    const have = view[type] ?? 0;
    // 余额不足时不写入任何变化，由调用方回滚整个事务。
    if (have + BALANCE_EPSILON < amount) return false;
    view[type] = have - amount;
    entries.push({
      action: 'consume',
      type,
      amount,
      source,
      balance: view[type],
      tick: meta.tick ?? null,
    });
    return true;
  }

  // 结算结束时的统一仓库截断，返回被丢弃的溢出量。
  clampToCapacity(type, source = 'capacity') {
    const { view, entries, meta } = this._target();
    const capacity = this.getCapacity(type);
    const value = view[type] ?? 0;
    if (value <= capacity) return 0;
    const wasted = value - capacity;
    view[type] = capacity;
    entries.push({
      action: 'clamp',
      type,
      amount: wasted,
      wasted,
      source,
      balance: capacity,
      tick: meta.tick ?? null,
    });
    return wasted;
  }

  commit() {
    if (!this._tx) throw new Error('no active transaction to commit');
    const tx = this._tx;
    this.resources = tx.working;
    for (const entry of tx.entries) this.log.push(entry);
    this._tx = null;
  }

  rollback() {
    this._tx = null;
  }
}

module.exports = { ResourceState, BALANCE_EPSILON };
