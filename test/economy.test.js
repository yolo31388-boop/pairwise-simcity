
const { EconomySystem } = require('../src/systems/economy.js');
const { Building } = require('../src/entities/building.js');

describe('模拟经营资源结算', () => {
  test('同tick多建筑产出应累加', () => {
    const eco = new EconomySystem();
    eco.buildings.push(new Building('mine', 1, {gold: 10}));
    eco.buildings.push(new Building('mine', 1, {gold: 5}));
    eco.tick();
    expect(eco.resources.get('gold')).toBe(115);
  });

  test('消耗不足应原子失败', () => {
    const eco = new EconomySystem();
    const result = eco.consumeResources({gold: 200, wood: 10});
    expect(result).toBe(false);
    expect(eco.resources.get('gold')).toBe(100);
    expect(eco.resources.get('wood')).toBe(50);
  });

  test('资源应始终非负', () => {
    const eco = new EconomySystem();
    eco.consumeResources({gold: 500});
    expect(eco.resources.get('gold')).toBeGreaterThanOrEqual(0);
  });

  test('升级期间产出应按比例', () => {
    const eco = new EconomySystem();
    const b = new Building('mine', 2, {gold: 10});
    b.upgrading = true; b.upgradeProgress = 0.5;
    eco.buildings.push(b);
    eco.tick();
    expect(eco.resources.get('gold')).toBeGreaterThan(100);
    expect(eco.resources.get('gold')).toBeLessThan(120);
  });

  test('零产出建筑不影响结算', () => {
    const eco = new EconomySystem();
    eco.buildings.push(new Building('empty', 1, {}));
    eco.tick();
    expect(eco.resources.get('gold')).toBe(100);
  });

  test('资源日志应完整', () => {
    const eco = new EconomySystem();
    eco.resources.add('gold', 10);
    eco.resources.consume('gold', 5);
    expect(eco.resources.log.length).toBe(2);
  });
});

describe('引擎边界不变量（新增）', () => {
  test('同tick三个建筑产同种资源精确累加', () => {
    const eco = new EconomySystem();
    eco.buildings.push(new Building('mine', 1, {gold: 10}));
    eco.buildings.push(new Building('mine', 2, {gold: 10}));
    eco.buildings.push(new Building('mine', 3, {gold: 10}));
    eco.tick();
    expect(eco.resources.get('gold')).toBe(100 + 10 + 20 + 30);
  });

  test('同tick多资源分别累加互不覆盖', () => {
    const eco = new EconomySystem();
    eco.buildings.push(new Building('mine', 1, {gold: 10, wood: 5}));
    eco.buildings.push(new Building('farm', 1, {wood: 7, food: 3}));
    eco.tick();
    expect(eco.resources.get('gold')).toBe(110);
    expect(eco.resources.get('wood')).toBe(62);
    expect(eco.resources.get('food')).toBe(33);
  });

  test('消耗部分资源不足时整体原子失败', () => {
    const eco = new EconomySystem();
    const result = eco.consumeResources({gold: 50, wood: 999});
    expect(result).toBe(false);
    expect(eco.resources.get('gold')).toBe(100);
    expect(eco.resources.get('wood')).toBe(50);
    expect(eco.resources.log.length).toBe(0);
  });

  test('连续合法消耗后存量精确且非负', () => {
    const eco = new EconomySystem();
    expect(eco.consumeResources({gold: 40})).toBe(true);
    expect(eco.consumeResources({gold: 60})).toBe(true);
    expect(eco.resources.get('gold')).toBe(0);
    expect(eco.consumeResources({gold: 1})).toBe(false);
    expect(eco.resources.get('gold')).toBeGreaterThanOrEqual(0);
  });

  test('仓库容量在结算结束时统一截断', () => {
    const eco = new EconomySystem({capacity: {gold: 120}});
    eco.buildings.push(new Building('mine', 1, {gold: 50}));
    eco.buildings.push(new Building('mine', 1, {gold: 50}));
    eco.tick();
    expect(eco.resources.get('gold')).toBe(120);
  });

  test('同事务内先超容量后被消耗不应被逐步截断', () => {
    const eco = new EconomySystem({capacity: {gold: 120}});
    eco.buildings.push(new Building('mine', 1, {gold: 50})); // 100+50=150 中间超容量
    eco.tick({gold: 40}); // 同一事务消耗40，最终110不应被截到80
    expect(eco.resources.get('gold')).toBe(110);
  });

  test('tick内消耗不足时产出也整体回滚', () => {
    const eco = new EconomySystem();
    eco.buildings.push(new Building('mine', 1, {gold: 10}));
    const ok = eco.tick({gold: 500});
    expect(ok).toBe(false);
    expect(eco.resources.get('gold')).toBe(100);
    expect(eco.resources.log.length).toBe(0);
  });

  test('升级期间产出按比例精确计算', () => {
    const eco = new EconomySystem();
    const b = new Building('mine', 2, {gold: 10});
    b.upgrading = true; b.upgradeProgress = 0.25;
    eco.buildings.push(b);
    eco.tick();
    expect(eco.resources.get('gold')).toBe(100 + 10 * 2 * 0.75);
  });

  test('离线收益按真实经过时间线性计算', () => {
    const eco1 = new EconomySystem();
    eco1.buildings.push(new Building('mine', 2, {gold: 10}));
    eco1.settleOffline(3);
    const eco2 = new EconomySystem();
    eco2.buildings.push(new Building('mine', 2, {gold: 10}));
    eco2.settleOffline(6);
    expect(eco1.resources.get('gold')).toBe(100 + 20 * 3);
    expect(eco2.resources.get('gold')).toBe(100 + 20 * 6);
    expect(eco2.resources.get('gold') - 100).toBe(2 * (eco1.resources.get('gold') - 100));
  });

  test('离线收益受仓库容量统一截断', () => {
    const eco = new EconomySystem({capacity: 150});
    eco.buildings.push(new Building('mine', 1, {gold: 10}));
    eco.settleOffline(1000);
    expect(eco.resources.get('gold')).toBe(150);
  });

  test('资源日志包含每步来源与数量', () => {
    const eco = new EconomySystem();
    eco.buildings.push(new Building('mine', 1, {gold: 10}));
    eco.buildings.push(new Building('farm', 1, {food: 5}));
    eco.tick();
    eco.consumeResources({gold: 5});
    const log = eco.resources.log;
    expect(log.length).toBe(3);
    expect(log[0]).toEqual({action: 'add', type: 'gold', amount: 10, source: 'building:mine'});
    expect(log[1]).toEqual({action: 'add', type: 'food', amount: 5, source: 'building:farm'});
    expect(log[2]).toEqual({action: 'consume', type: 'gold', amount: 5, source: 'consumeResources'});
  });

  test('零产出建筑不产生日志也不改变资源', () => {
    const eco = new EconomySystem();
    eco.buildings.push(new Building('empty', 1, {}));
    eco.buildings.push(new Building('decor', 1, {gold: 0}));
    eco.tick();
    expect(eco.resources.get('gold')).toBe(100);
    expect(eco.resources.log.length).toBe(0);
  });

  test('大量建筑结算性能可接受', () => {
    const eco = new EconomySystem();
    for (let i = 0; i < 10000; i++) {
      eco.buildings.push(new Building('mine', 1, {gold: 1}));
    }
    const start = Date.now();
    eco.tick();
    const elapsed = Date.now() - start;
    expect(eco.resources.get('gold')).toBe(100 + 10000);
    expect(elapsed).toBeLessThan(1000);
  });

  test('建筑顺序不同结算结果确定一致', () => {
    const make = () => [
      new Building('mine', 2, {gold: 10, wood: 3}),
      new Building('farm', 1, {food: 8, gold: 1}),
      new Building('mill', 3, {wood: 2}),
    ];
    const ecoA = new EconomySystem();
    ecoA.buildings.push(...make());
    const ecoB = new EconomySystem();
    ecoB.buildings.push(...make().reverse());
    ecoA.tick();
    ecoB.tick();
    for (const type of ['gold', 'wood', 'food']) {
      expect(ecoA.resources.get(type)).toBe(ecoB.resources.get(type));
    }
  });

  test('跨tick资源状态连续累积', () => {
    const eco = new EconomySystem();
    eco.buildings.push(new Building('mine', 1, {gold: 10}));
    eco.tick();
    expect(eco.resources.get('gold')).toBe(110);
    eco.consumeResources({gold: 5});
    eco.tick();
    expect(eco.resources.get('gold')).toBe(115);
    eco.tick();
    expect(eco.resources.get('gold')).toBe(125);
  });
});
