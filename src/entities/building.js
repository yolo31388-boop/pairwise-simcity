
class Building {
  constructor(type, level, production) {
    this.type = type; this.level = level; this.production = production;
    this.upgrading = false; this.upgradeProgress = 0;
  }
  getOutput() {
    if (this.upgrading) {
      // BUG: 升级期间产出计算错误
      return this.production;
    }
    return this.production * this.level;
  }
}

module.exports = { Building };
