
const { EconomySystem, TICK_MS } = require('../src/systems/economy.js');
const { Building } = require('../src/entities/building.js');
const { ResourceState } = require('../src/state/resource.js');

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

  test('同tick三个建筑产出同种资源必须累加而非覆盖', () => {
    const eco = new EconomySystem();
    eco.buildings.push(new Building('mine', 1, {gold: 10}, 'm1'));
    eco.buildings.push(new Building('mine', 1, {gold: 5}, 'm2'));
    eco.buildings.push(new Building('mine', 1, {gold: 7}, 'm3'));
    eco.tick();
    expect(eco.resources.get('gold')).toBe(122);
  });

  test('多资源产出与跨资源累加均正确', () => {
    const eco = new EconomySystem();
    eco.buildings.push(new Building('sawmill', 1, {wood: 10, food: 4}, 's1'));
    eco.buildings.push(new Building('farm', 1, {wood: 3, food: 6}, 'f1'));
    eco.tick();
    expect(eco.resources.get('wood')).toBe(63);
    expect(eco.resources.get('food')).toBe(40);
  });

  test('消耗不足时多资源成本必须整体原子失败，不产生部分扣除', () => {
    const eco = new EconomySystem();
    const result = eco.consumeResources({gold: 80, wood: 500});
    expect(result).toBe(false);
    expect(eco.resources.get('gold')).toBe(100);
    expect(eco.resources.get('wood')).toBe(50);
  });

  test('tick内消耗不足时产出也必须一起回滚', () => {
    const eco = new EconomySystem();
    eco.buildings.push(new Building('mine', 1, {gold: 10}, 'm1'));
    const result = eco.tick({wood: 999});
    expect(result).toBe(false);
    expect(eco.resources.get('gold')).toBe(100);
    expect(eco.resources.get('wood')).toBe(50);
    const hasProduce = eco.resources.log.some((e) => e.action === 'produce');
    expect(hasProduce).toBe(false);
    expect(eco.resources.log.some((e) => e.action === 'consume_rejected')).toBe(true);
  });

  test('任何失败操作后所有资源数量保持非负', () => {
    const eco = new EconomySystem();
    expect(eco.consume({gold: 100000})).toBe(false);
    expect(eco.tick({gold: 100000})).toBe(false);
    for (const type of ['gold', 'wood', 'food']) {
      expect(eco.resources.get(type)).toBeGreaterThanOrEqual(0);
    }
  });

  test('仓库容量在结算结束时统一截断', () => {
    const eco = new EconomySystem();
    eco.resources.setCapacity('gold', 120);
    eco.buildings.push(new Building('mine', 1, {gold: 10}, 'm1'));
    eco.buildings.push(new Building('mine', 1, {gold: 20}, 'm2'));
    eco.tick();
    expect(eco.resources.get('gold')).toBe(120);
    expect(eco.resources.log.some((e) => e.action === 'clamp' && e.type === 'gold')).toBe(true);
  });

  test('产出后紧接消耗时不能在中间步截断，否则会丢失产出', () => {
    const eco = new EconomySystem();
    eco.resources.setCapacity('gold', 120);
    eco.buildings.push(new Building('mine', 1, {gold: 30}, 'm1'));
    // 统一结算：100 + 30 - 25 = 105（始终低于上限，不应有任何截断）。
    // 若每步截断：130 先截到 120 再扣 25 = 95，产出被错误丢失。
    expect(eco.tick({gold: 25})).toBe(true);
    expect(eco.resources.get('gold')).toBe(105);
    expect(eco.resources.log.some((e) => e.action === 'clamp')).toBe(false);
  });

  test('升级期间产出按当前等级与升级进度比例计算', () => {
    const make = (level, progress) => {
      const eco = new EconomySystem();
      const b = new Building('mine', level, {gold: 10}, 'm');
      b.upgrading = true;
      b.upgradeProgress = progress;
      eco.buildings.push(b);
      eco.tick();
      return eco.resources.get('gold');
    };
    expect(make(2, 0)).toBe(100);
    expect(make(2, 0.5)).toBe(110);
    expect(make(4, 0.25)).toBe(110);
    expect(make(3, 1)).toBe(130);
  });

  test('升级产出不是满级产出也不是零产出', () => {
    const eco = new EconomySystem();
    const b = new Building('mine', 5, {gold: 10}, 'm5');
    b.upgrading = true;
    b.upgradeProgress = 0.5;
    eco.buildings.push(b);
    eco.tick();
    const gold = eco.resources.get('gold');
    expect(gold).toBeGreaterThan(100);
    expect(gold).toBeLessThan(150);
    expect(gold).toBe(125);
  });

  test('离线收益按真实经过时间和建筑等级计算', () => {
    const t0 = 1_000_000;
    const eco = new EconomySystem({clock: t0});
    eco.buildings.push(new Building('mine', 1, {gold: 10}, 'm1'));
    const result = eco.flushOffline(t0 + 2.5 * TICK_MS);
    expect(result.elapsedMs).toBe(2500);
    expect(result.ticks).toBe(2.5);
    expect(result.gains.gold).toBe(25);
    expect(eco.resources.get('gold')).toBe(125);
  });

  test('离线收益随时间连续推进且受建筑等级影响，不是固定值', () => {
    const t0 = 2_000_000;
    const eco = new EconomySystem({clock: t0});
    eco.buildings.push(new Building('mine', 3, {gold: 10}, 'm3'));
    eco.flushOffline(t0 + TICK_MS);
    expect(eco.resources.get('gold')).toBe(130);
    eco.flushOffline(t0 + 2 * TICK_MS);
    expect(eco.resources.get('gold')).toBe(160);
    // 零经过时间不产生收益，也不写日志。
    const logLen = eco.resources.log.length;
    const noTime = eco.flushOffline(t0 + 2 * TICK_MS);
    expect(noTime.gains.gold || 0).toBe(0);
    expect(eco.resources.log.length).toBe(logLen);
  });

  test('离线收益同样在结束时统一截断到仓库容量', () => {
    const t0 = 3_000_000;
    const eco = new EconomySystem({clock: t0});
    eco.resources.setCapacity('gold', 120);
    eco.buildings.push(new Building('mine', 1, {gold: 10}, 'm1'));
    const result = eco.flushOffline(t0 + 10 * TICK_MS);
    expect(eco.resources.get('gold')).toBe(120);
    expect(result.gains.gold).toBe(20);
  });

  test('产出与消耗同事务成功结算且日志顺序反映单事务', () => {
    const eco = new EconomySystem();
    eco.buildings.push(new Building('mine', 1, {gold: 10}, 'm1'));
    expect(eco.tick({gold: 5})).toBe(true);
    expect(eco.resources.get('gold')).toBe(105);
    const actions = eco.resources.log.map((e) => e.action);
    expect(actions).toEqual(['produce', 'consume']);
  });

  test('资源日志包含每步来源、数量、余额与tick', () => {
    const eco = new EconomySystem();
    eco.buildings.push(new Building('mine', 1, {gold: 10}, 'm1'));
    eco.buildings.push(new Building('mine', 1, {gold: 5}, 'm2'));
    eco.tick();
    const [first, second] = eco.resources.log;
    expect(first).toMatchObject({action: 'produce', type: 'gold', amount: 10, source: 'm1', balance: 110, tick: 0});
    expect(second).toMatchObject({action: 'produce', type: 'gold', amount: 5, source: 'm2', balance: 115, tick: 0});
    eco.tick();
    expect(eco.resources.log[2].tick).toBe(1);
  });

  test('零产出建筑不影响结算余额和日志', () => {
    const eco = new EconomySystem();
    eco.buildings.push(new Building('empty', 1, {}, 'e1'));
    const stalled = new Building('mine', 2, {gold: 10}, 'stalled');
    stalled.upgrading = true;
    stalled.upgradeProgress = 0;
    eco.buildings.push(stalled);
    eco.buildings.push(new Building('mine', 1, {gold: 10}, 'm1'));
    eco.tick();
    expect(eco.resources.get('gold')).toBe(110);
    expect(eco.resources.log.length).toBe(1);
    expect(eco.resources.log[0].source).toBe('m1');
  });

  test('大量建筑单tick结算的性能与正确性', () => {
    const eco = new EconomySystem();
    for (let i = 0; i < 10000; i += 1) {
      eco.buildings.push(new Building('mine', 1, {gold: 1}, `m${i}`));
    }
    const started = Date.now();
    eco.tick();
    const elapsed = Date.now() - started;
    expect(eco.resources.get('gold')).toBe(10100);
    expect(eco.resources.log.length).toBe(10000);
    expect(elapsed).toBeLessThan(1000);
  });

  test('建筑处理顺序不影响最终结果（并发修改确定性）', () => {
    const amounts = [3, 7, 2, 8, 5];
    const build = (order) => {
      const eco = new EconomySystem();
      for (const index of order) {
        eco.buildings.push(new Building('mine', 1, {gold: amounts[index]}, `m${index}`));
      }
      eco.tick();
      return eco;
    };
    const a = build([0, 1, 2, 3, 4]);
    const b = build([4, 3, 2, 1, 0]);
    expect(a.resources.get('gold')).toBe(b.resources.get('gold'));
    expect(a.resources.get('gold')).toBe(125);
    const totalOf = (eco) => eco.resources.log.reduce((sum, e) => sum + e.amount, 0);
    expect(totalOf(a)).toBe(totalOf(b));
  });

  test('跨tick资源状态连续累积', () => {
    const eco = new EconomySystem();
    eco.buildings.push(new Building('mine', 1, {gold: 10}, 'm1'));
    eco.tick();
    eco.tick();
    eco.tick();
    expect(eco.resources.get('gold')).toBe(130);
    expect(eco.consume({gold: 30})).toBe(true);
    expect(eco.resources.get('gold')).toBe(100);
    eco.tick();
    expect(eco.resources.get('gold')).toBe(110);
  });

  test('ResourceState 直接使用时仍是增量累加且消耗受余额保护', () => {
    const state = new ResourceState({gold: 10});
    state.produce('gold', 5, 'x');
    state.produce('gold', 5, 'y');
    expect(state.get('gold')).toBe(20);
    expect(state.consume('gold', 25, 'z')).toBe(false);
    expect(state.get('gold')).toBe(20);
    expect(state.snapshot()).toEqual({gold: 20});
  });
});
