
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
