// The DOM HUD: crosshair, hit marker, health, money, ammo, timer, score, kill feed,
// buy menu, minimap and the overlay panels. It never touches the simulation; main.js
// pushes numbers in and reads button callbacks out. Writes are cached so the DOM is
// only touched when a value actually changes.
import { WEAPONS, GRENADE } from './weapons.js';
import { MAP } from './mapdata.js';

const COPY = {
  start: {
    title: 'STRIKE LANE',
    copy: 'A tactical round-based shooter. Plant the spike at A or B, or wipe the Wardens. First to 5 rounds takes the match.',
    action: 'Deploy',
  },
  paused: {
    title: 'STRIKE LANE',
    copy: 'Paused. Click to resume.',
    action: 'Resume',
  },
  dead: {
    title: 'You are down',
    copy: 'Spectating your squad. The round plays on.',
    action: 'Keep watching',
  },
  match: {
    title: 'STRIKE LANE',
    copy: 'Match over. Click Deploy to play again.',
    action: 'Deploy',
  },
};

export function createHud() {
  const el = (id) => document.getElementById(id);
  const overlay = el('overlay');
  const title = el('overlay-title');
  const copy = el('overlay-copy');
  const play = el('play');
  const banner = el('banner');
  const bannerTitle = el('banner-title');
  const bannerSub = el('banner-sub');
  const buyMenu = el('buy-menu');
  const buyMoney = el('buy-money');
  const buyList = el('buy-list');
  const ammoMag = el('ammo-mag');
  const ammoReserve = el('ammo-reserve');
  const weaponName = el('weapon-name');
  const grenadeCount = el('grenade-count');
  const healthFill = el('health-fill');
  const healthValue = el('health-value');
  const moneyValue = el('money-value');
  const timerValue = el('timer-value');
  const roundValue = el('round-value');
  const scoreAttacker = el('score-attacker');
  const scoreDefender = el('score-defender');
  const aliveAttacker = el('alive-attacker');
  const aliveDefender = el('alive-defender');
  const killFeed = el('killfeed');
  const crosshair = el('crosshair');
  const hitmarker = el('hitmarker');
  const plantBar = el('plant-bar');
  const plantFill = el('plant-fill');
  const plantLabel = el('plant-label');
  const spikeChip = el('spike-chip');
  const damageFlash = el('damage-flash');
  const minimap = el('minimap');
  const mapCtx = minimap.getContext('2d');

  let lastAmmo = '';
  let lastHealth = -1;
  let lastMoney = -1;
  let lastTimer = '';
  let lastScore = '';
  let lastAlive = '';
  let lastWeapon = '';
  let lastGrenades = -1;
  let lastSpike = '';
  let hitTimer = 0;
  let bannerTimer = 0;

  // Build the buy menu once.
  const buyItems = [
    { id: 'rifle', key: '1' },
    { id: 'smg', key: '2' },
    { id: 'shotgun', key: '3' },
    { id: 'grenade', key: '4' },
  ];
  for (const item of buyItems) {
    const def = item.id === 'grenade' ? GRENADE : WEAPONS[item.id];
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'buy-item';
    row.dataset.item = item.id;
    row.innerHTML = `<span class="buy-key">${item.key}</span><span class="buy-name">${def.name}</span><span class="buy-price">$${def.price}</span>`;
    buyList.appendChild(row);
  }

  function formatTimer(seconds) {
    const total = Math.max(0, Math.ceil(seconds));
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
  }

  function drawMinimap(dots) {
    const W = minimap.width;
    const H = minimap.height;
    const scaleX = W / 58;
    const scaleZ = H / 42;
    const toX = (x) => (x + 29) * scaleX;
    const toY = (z) => (z + 21) * scaleZ;
    mapCtx.clearRect(0, 0, W, H);
    mapCtx.fillStyle = 'rgba(14,18,22,0.82)';
    mapCtx.fillRect(0, 0, W, H);
    // Walls and containers as rectangles.
    mapCtx.fillStyle = '#5a646e';
    for (const box of MAP.boxes) {
      if (box.h < 2.5) continue;
      mapCtx.fillRect(toX(box.x - box.w / 2), toY(box.z - box.d / 2), box.w * scaleX, box.d * scaleZ);
    }
    // Sites.
    for (const site of MAP.sites) {
      mapCtx.strokeStyle = site.color;
      mapCtx.lineWidth = 1.5;
      mapCtx.beginPath();
      mapCtx.arc(toX(site.x), toY(site.z), site.radius * scaleX, 0, Math.PI * 2);
      mapCtx.stroke();
      mapCtx.fillStyle = site.color;
      mapCtx.font = 'bold 11px system-ui, sans-serif';
      mapCtx.textAlign = 'center';
      mapCtx.fillText(site.id, toX(site.x), toY(site.z) + 4);
    }
    // Dots: player amber, allies light amber, seen enemies red, spike white.
    for (const dot of dots) {
      mapCtx.fillStyle = dot.color;
      mapCtx.beginPath();
      mapCtx.arc(toX(dot.x), toY(dot.z), dot.size, 0, Math.PI * 2);
      mapCtx.fill();
    }
  }

  return {
    setAmmo(mag, reserve, weaponId, grenades) {
      const key = `${mag}|${reserve}|${weaponId}|${grenades}`;
      if (key === lastAmmo) return;
      lastAmmo = key;
      ammoMag.textContent = String(mag);
      ammoReserve.textContent = `/ ${reserve}`;
      const def = WEAPONS[weaponId];
      if (def && def.name !== lastWeapon) {
        weaponName.textContent = def.name;
        lastWeapon = def.name;
      }
      if (grenades !== lastGrenades) {
        grenadeCount.textContent = grenades > 0 ? `HE-7 x${grenades}` : 'HE-7 —';
        lastGrenades = grenades;
      }
      el('ammo').classList.toggle('empty', mag === 0);
    },
    setHealth(value) {
      const rounded = Math.round(value);
      if (rounded === lastHealth) return;
      lastHealth = rounded;
      healthValue.textContent = String(rounded);
      healthFill.style.width = `${rounded}%`;
      healthFill.style.background = rounded > 50 ? '#37c8a3' : rounded > 25 ? '#ffb02e' : '#e5484d';
    },
    setMoney(value) {
      const rounded = Math.round(value);
      if (rounded === lastMoney) return;
      lastMoney = rounded;
      moneyValue.textContent = `$${rounded}`;
      buyMoney.textContent = `$${rounded}`;
    },
    setTimer(seconds, phase) {
      const key = `${formatTimer(seconds)}|${phase}`;
      if (key === lastTimer) return;
      lastTimer = key;
      timerValue.textContent = formatTimer(seconds);
      timerValue.parentElement.classList.toggle('planted', phase === 'planted');
    },
    setScore(round, a, d) {
      const key = `${round}|${a}|${d}`;
      if (key === lastScore) return;
      lastScore = key;
      roundValue.textContent = `ROUND ${round}`;
      scoreAttacker.textContent = String(a);
      scoreDefender.textContent = String(d);
    },
    setAlive(attackers, defenders) {
      const key = `${attackers}|${defenders}`;
      if (key === lastAlive) return;
      lastAlive = key;
      aliveAttacker.textContent = `STRIKERS ${attackers}`;
      aliveDefender.textContent = `WARDENS ${defenders}`;
    },
    setSpike(text) {
      if (text === lastSpike) return;
      lastSpike = text;
      spikeChip.textContent = text;
      spikeChip.style.display = text ? 'block' : 'none';
    },
    setCrosshair(spread) {
      crosshair.style.setProperty('--gap', `${4 + Math.min(26, spread * 900)}px`);
    },
    hitMarker(killed, holdMs = 90) {
      hitmarker.classList.add('on');
      hitmarker.classList.toggle('kill', killed);
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => hitmarker.classList.remove('on', 'kill'), holdMs);
    },
    feed(text, good) {
      const item = document.createElement('div');
      item.className = good ? 'feed-item good' : 'feed-item bad';
      item.textContent = text;
      killFeed.prepend(item);
      while (killFeed.children.length > 4) killFeed.removeChild(killFeed.lastChild);
    },
    flashDamage() {
      damageFlash.classList.add('on');
      setTimeout(() => damageFlash.classList.remove('on'), 140);
    },
    showBanner(titleText, subText, good, holdMs = 4200) {
      bannerTitle.textContent = titleText;
      bannerSub.textContent = subText;
      banner.classList.toggle('good', good);
      banner.classList.toggle('bad', !good);
      banner.hidden = false;
      clearTimeout(bannerTimer);
      if (holdMs > 0) bannerTimer = setTimeout(() => { banner.hidden = true; }, holdMs);
    },
    hideBanner() {
      banner.hidden = true;
    },
    showPlant(label, progress) {
      plantBar.hidden = false;
      plantLabel.textContent = label;
      plantFill.style.width = `${Math.round(progress * 100)}%`;
    },
    hidePlant() {
      plantBar.hidden = true;
    },
    showOverlay(mode) {
      const text = COPY[mode];
      title.textContent = text.title;
      copy.textContent = text.copy;
      play.textContent = text.action;
      overlay.hidden = false;
      play.focus();
    },
    hideOverlay() {
      overlay.hidden = true;
    },
    onPlay(handler) {
      play.addEventListener('click', handler);
    },
    get overlayOpen() {
      return !overlay.hidden;
    },
    showBuy(money) {
      buyMoney.textContent = `$${Math.round(money)}`;
      buyMenu.hidden = false;
    },
    hideBuy() {
      buyMenu.hidden = true;
    },
    get buyOpen() {
      return !buyMenu.hidden;
    },
    markBuy(itemId, state) {
      const row = buyList.querySelector(`[data-item="${itemId}"]`);
      if (!row) return;
      row.classList.toggle('owned', state === 'owned');
      row.classList.toggle('cant', state === 'cant');
    },
    onBuy(handler) {
      buyList.addEventListener('click', (event) => {
        const row = event.target.closest('.buy-item');
        if (row) handler(row.dataset.item);
      });
    },
    drawMinimap,
  };
}
