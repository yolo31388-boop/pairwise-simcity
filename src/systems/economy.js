

class EconomySystem {
  constructor() { this.resources = new ResourceState(); this.buildings = []; }
  tick() {
    for (const b of this.buildings) {
      const output = b.getOutput();
      for (const [type, amount] of Object.entries(output)) {
        this.resources.add(type, amount); // BUG: 覆盖而非累加
      }
    }
    // BUG: 没有仓库容量截断
  }
  consumeResources(costs) {
    for (const [type, amount] of Object.entries(costs)) {
      this.resources.consume(type, amount); // BUG: 不原子
    }
    return true;
  }
}

module.exports = { EconomySystem };
