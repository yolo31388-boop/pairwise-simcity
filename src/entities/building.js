'use strict';

let BUILDING_SEQ = 0;

function clamp01(value) {
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

function quantize(value) {
  const rounded = Math.round(value * 1e6) / 1e6;
  return Object.is(rounded, -0) ? 0 : rounded;
}

class Building {
  constructor(type, level, production, id = null) {
    this.id = id ?? `${type}-${++BUILDING_SEQ}`;
    this.type = type;
    this.level = level;
    this.production = production || {};
    this.upgrading = false;
    this.upgradeProgress = 0;
  }

  // 升级期间按 upgradeProgress 在当前等级产出上按比例缩放，
  // 既不是满级产出也不是零产出。
  getOutput() {
    const ratio = this.upgrading ? clamp01(this.upgradeProgress) : 1;
    const output = {};
    for (const [resource, base] of Object.entries(this.production)) {
      if (!Number.isFinite(base) || base <= 0) continue;
      const amount = quantize(base * this.level * ratio);
      if (amount > 0) output[resource] = amount;
    }
    return output;
  }
}

module.exports = { Building, quantize, clamp01 };
