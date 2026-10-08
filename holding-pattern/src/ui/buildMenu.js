import { ICONS } from './icons.js';
import { TOOL_DEFS } from '../build/tools.js';
import { money } from '../core/math.js';

// Left-hand build menu with icons and costs, plus the stand size picker.
export class BuildMenu {
  constructor(ui, root) {
    this.ui = ui;
    this.game = ui.game;
    const el = document.createElement('div');
    el.id = 'build';
    el.className = 'panel';
    let html = '';
    let group = null;
    for (const t of TOOL_DEFS) {
      if (t.group !== group) {
        group = t.group;
        html += `<h4>${group}</h4>`;
      }
      html += `<button class="tool" data-tool="${t.id}" title="${t.hint}"><span class="ic">${ICONS[t.id]}</span><span class="nm">${t.label}</span><span class="cs">${t.cost}</span></button>`;
      if (t.id === 'gate') html += `<div class="sizes" id="sizes" style="display:none">${['S', 'M', 'L'].map((s) => `<button class="btn" data-size="${s}">${s}</button>`).join('')}</div>`;
    }
    html += `<div class="toolhint" id="toolhint"></div>`;
    el.innerHTML = html;
    root.appendChild(el);
    this.el = el;
    this.$tools = [...el.querySelectorAll('.tool')];
    this.$sizes = el.querySelector('#sizes');
    this.$hint = el.querySelector('#toolhint');
    this.$tools.forEach((b) => (b.onclick = () => this.game.build.setTool(b.dataset.tool)));
    el.querySelectorAll('[data-size]').forEach((b) => (b.onclick = () => this.game.build.setSize(b.dataset.size)));
    this.game.events.on('toolChanged', () => this.sync());
    this.sync();
  }

  sync() {
    const b = this.game.build;
    const tool = b.tool;
    this.$tools.forEach((el) => el.classList.toggle('on', el.dataset.tool === tool));
    const sized = tool === 'stand' || tool === 'gate';
    this.$sizes.style.display = sized ? 'flex' : 'none';
    // move the size picker under the active sized tool
    if (sized) {
      const btn = this.$tools.find((x) => x.dataset.tool === tool);
      btn.after(this.$sizes);
    }
    this.$sizes.querySelectorAll('.btn').forEach((x) => x.classList.toggle('on', x.dataset.size === b.size));
    const def = b.def;
    if (def) {
      let extra = '';
      if (def.rotates) extra = ' <kbd>Q</kbd>/<kbd>E</kbd> rotate.';
      if (def.drag) extra += ' Right-click cancels.';
      this.$hint.innerHTML = `${def.hint}${extra} <kbd>Esc</kbd> to stop building.`;
    } else {
      this.$hint.innerHTML = `Pick a tool to build. Drag to orbit, right-drag or <kbd>WASD</kbd> to pan, scroll to zoom.`;
    }
  }
}

// Floating cost / reason tooltip that follows the cursor while building.
export class CursorTip {
  constructor(ui, root) {
    this.game = ui.game;
    const el = document.createElement('div');
    el.id = 'tip';
    root.appendChild(el);
    this.el = el;
    this.res = null;
    this.game.events.on('buildPreview', (res) => {
      this.res = res;
      this.render();
    });
    window.addEventListener('pointermove', (e) => {
      this.el.style.left = e.clientX + 'px';
      this.el.style.top = e.clientY + 'px';
    });
  }

  render() {
    const r = this.res;
    if (!r || !this.game.build.tool) {
      this.el.classList.remove('show');
      return;
    }
    const parts = [];
    if (r.cost > 0) parts.push(`<span class="cost">${money(r.cost)}</span>`);
    else if (r.cost < 0) parts.push(`<span class="cost refund">Refund ${money(-r.cost)}</span>`);
    if (r.info) parts.push(`<span class="info">${r.info}</span>`);
    if (r.reason) parts.push(`<span class="why">${r.reason}</span>`);
    if (!parts.length) {
      this.el.classList.remove('show');
      return;
    }
    this.el.innerHTML = parts.join(' ');
    this.el.classList.add('show');
  }
}
