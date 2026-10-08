import { BALANCE } from '../config/balance.js';

// Money, the daily ledger, wages and the bankruptcy countdown.
export class Economy {
  constructor(events) {
    this.events = events;
    this.reset();
  }

  reset() {
    this.money = BALANCE.startMoney;
    this.negDays = 0;
    this.today = this.blankLedger();
    this.history = []; // last days: { day, income, expenses, net, lines }
    this.totals = { income: 0, expenses: 0 };
  }

  blankLedger() {
    return { income: {}, expenses: {} };
  }

  canAfford(n) {
    return this.money >= n;
  }

  spend(amount, category, silent = false) {
    if (amount <= 0) return;
    this.money -= amount;
    this.today.expenses[category] = (this.today.expenses[category] || 0) + amount;
    this.totals.expenses += amount;
    this.events.emit('money', -amount, category, silent);
  }

  earn(amount, category, silent = false) {
    if (amount <= 0) return;
    this.money += amount;
    this.today.income[category] = (this.today.income[category] || 0) + amount;
    this.totals.income += amount;
    this.events.emit('money', amount, category, silent);
  }

  // refunds count against today's build spending rather than as income
  refund(amount) {
    if (amount <= 0) return;
    this.money += amount;
    this.today.expenses.construction = (this.today.expenses.construction || 0) - amount;
    this.totals.expenses -= amount;
    this.events.emit('money', amount, 'refund', false);
  }

  wagesFor(grid) {
    const w = BALANCE.wages;
    let total = 0;
    const lines = {};
    for (const r of grid.rooms) {
      const v = w[r.type] || 0;
      total += v;
      lines[r.type] = (lines[r.type] || 0) + v;
    }
    return { total, lines };
  }

  // Called at midnight. Returns the summary for the day that just ended.
  closeDay(day, grid) {
    const wages = this.wagesFor(grid);
    if (wages.total > 0) this.spend(wages.total, 'wages', true);
    const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);
    const income = sum(this.today.income);
    const expenses = sum(this.today.expenses);
    const summary = { day, income, expenses, net: income - expenses, ledger: this.today, wages };
    this.history.push(summary);
    if (this.history.length > 14) this.history.shift();
    this.today = this.blankLedger();
    if (this.money < 0) this.negDays++;
    else this.negDays = 0;
    return summary;
  }

  toJSON() {
    return { money: this.money, negDays: this.negDays, today: this.today, history: this.history, totals: this.totals };
  }

  load(d) {
    this.money = d.money;
    this.negDays = d.negDays || 0;
    this.today = d.today || this.blankLedger();
    this.history = d.history || [];
    this.totals = d.totals || { income: 0, expenses: 0 };
  }
}
