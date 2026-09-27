
// 资源状态 - 存在覆盖写入和负数bug
class ResourceState {
  constructor() { this.resources = { gold: 100, wood: 50, food: 30 }; this.log = []; }
  add(type, amount) {
    // BUG: 后写覆盖，不是增量累加
    this.resources[type] = amount;
    this.log.push({type, amount, action: 'add'});
  }
  consume(type, amount) {
    // BUG: 不检查是否足够，直接扣
    this.resources[type] -= amount;
    this.log.push({type, amount, action: 'consume'});
    return true;
  }
  get(type) { return this.resources[type] || 0; }
}

module.exports = { ResourceState };
