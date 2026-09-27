'use strict';

const { ResourceState } = require('../state/resource.js');
const { quantize } = require('../entities/building.js');

const TICK_MS = 1000;

function assertNonNegativeTime(elapsedMs) {
  if (typeof elapsedMs !== 'number' || !Number.isFinite(elapsedMs) || elapsedMs < 0) {
    throw new RangeError(`elapsedMs must be a non-negative finite number, got ${elapsedMs}`);
  }
}

class EconomySystem {
  constructor(options = {}) {
    this.resources = options.resources instanceof ResourceState
      ? options.resources
      : new ResourceState(options.initial);
    this.buildings = [];
    this.tickCount = 0;
    this.lastSettledAt = options.clock ?? Date.now();
  }

  _sourceOf(building) {
    return building.id ?? `${building.type}@${this.buildings.indexOf(building)}`;
  }

  // 在当前事务工作副本上结算建筑产出（按 ratio 缩放），增量累加。
  _produceBuildings(ratio, sourcePrefix) {
    for (const building of this.buildings) {
      const output = building.getOutput();
      const source = sourcePrefix
        ? `${sourcePrefix}:${this._sourceOf(building)}`
        : this._sourceOf(building);
      for (const [type, amount] of Object.entries(output)) {
        this.resources.produce(type, quantize(amount * ratio), source);
      }
    }
  }

  _clampAll() {
    const types = new Set([
      ...Object.keys(this.resources.resources),
      ...Object.keys(this.resources.capacities),
    ]);
    for (const type of types) this.resources.clampToCapacity(type);
  }

  _recordRejection(costs, reason, meta) {
    for (const [type, amount] of Object.entries(costs)) {
      this.resources.log.push({
        action: 'consume_rejected',
        type,
        amount,
        reason,
        source: meta.source ?? 'consume',
        tick: this.tickCount,
      });
    }
  }

  // 单 tick 结算：产出与消耗在同一事务内完成，外部永远观察不到中间状态。
  tick(costs = {}, options = {}) {
    const meta = { tick: this.tickCount, source: options.source ?? 'tick' };
    this.resources.beginTransaction(meta);
    try {
      this._produceBuildings(1);
      if (Object.keys(costs).length > 0 && !this.resources.canAfford(costs)) {
        // 资源不足：整个 tick 原子失败，不产出、不扣除、不截断。
        this.resources.rollback();
        this._recordRejection(costs, 'insufficient', meta);
        return false;
      }
      for (const [type, amount] of Object.entries(costs)) {
        if (!this.resources.consume(type, amount, `tick:cost:${type}`)) {
          this.resources.rollback();
          this._recordRejection(costs, 'insufficient', meta);
          return false;
        }
      }
      // 仓库容量只在结算结束时统一截断一次。
      this._clampAll();
      this.resources.commit();
      this.tickCount += 1;
      return true;
    } catch (error) {
      this.resources.rollback();
      throw error;
    }
  }

  // 纯产出结算（无消耗），仍走同一事务并在结束时统一截断。
  produce() {
    return this.tick({}, { source: 'produce' });
  }

  // 独立消耗操作：先预检全部成本，任一不足则整体原子失败。
  consume(costs = {}, source = 'consume') {
    const meta = { tick: this.tickCount, source };
    this.resources.beginTransaction(meta);
    try {
      if (!this.resources.canAfford(costs)) {
        this.resources.rollback();
        this._recordRejection(costs, 'insufficient', meta);
        return false;
      }
      for (const [type, amount] of Object.entries(costs)) {
        if (!this.resources.consume(type, amount, `cost:${type}`)) {
          this.resources.rollback();
          this._recordRejection(costs, 'insufficient', meta);
          return false;
        }
      }
      this._clampAll();
      this.resources.commit();
      return true;
    } catch (error) {
      this.resources.rollback();
      throw error;
    }
  }

  // 向后兼容旧公开名。
  consumeResources(costs) {
    return this.consume(costs, 'consumeResources');
  }

  setTime(nowMs) {
    assertNonNegativeTime(nowMs);
    this.lastSettledAt = nowMs;
  }

  // 离线收益：按真实经过的毫秒数与建筑当前等级/升级状态缩放，
  // 不使用任何固定值；同样在单事务内结算并在结束时统一截断。
  flushOffline(nowMs) {
    assertNonNegativeTime(nowMs);
    const elapsedMs = Math.max(0, nowMs - this.lastSettledAt);
    const ratio = elapsedMs / TICK_MS;
    const before = this.resources.snapshot();

    if (ratio > 0) {
      const meta = { tick: this.tickCount, source: 'offline' };
      this.resources.beginTransaction(meta);
      try {
        this._produceBuildings(ratio, 'offline');
        this._clampAll();
        this.resources.commit();
      } catch (error) {
        this.resources.rollback();
        throw error;
      }
    }

    this.lastSettledAt = nowMs;
    const gains = {};
    for (const type of new Set([...Object.keys(before), ...Object.keys(this.resources.snapshot())])) {
      gains[type] = this.resources.get(type) - (before[type] ?? 0);
    }
    return { elapsedMs, ticks: ratio, gains };
  }
}

module.exports = { EconomySystem, TICK_MS };
