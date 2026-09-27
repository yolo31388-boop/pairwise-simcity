class Building {
  constructor(type, level, production) {
    this.type = type; this.level = level; this.production = production;
    this.upgrading = false; this.upgradeProgress = 0;
  }
  getOutput() {
    // 升级期间按剩余可工作时间比例产出，既非满级产出也非零产出
    const factor = this.upgrading
      ? this.level * Math.max(0, 1 - this.upgradeProgress)
      : this.level;
    const output = {};
    for (const [type, amount] of Object.entries(this.production || {})) {
      output[type] = amount * factor;
    }
    return output;
  }
}

module.exports = { Building };
