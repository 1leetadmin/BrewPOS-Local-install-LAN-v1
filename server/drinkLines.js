// Shared drink-item line rendering — CommonJS port of src/lib/drinkLines.js.
// Kept in sync manually; pure logic, no browser APIs, safe to duplicate here
// so the local print server has no dependency on the Vite client bundle.

const SIZE_WORDS = { SM: 'Small', MED: 'Medium', LRG: 'Large' };

function buildDrinkLines(item) {
  const mods = Array.isArray(item?.modifiers) ? item.modifiers : [];
  const name = (item?.name || '').trim();

  let sizeWord = '';
  const sizeMod = mods.find((m) => /size/i.test(m.name) && m.option);
  if (sizeMod) {
    const key = String(sizeMod.option).trim().toUpperCase();
    sizeWord = SIZE_WORDS[key] || sizeMod.option;
  }
  const line1 = [sizeWord, name].filter(Boolean).join(' ') || name;

  const lines = [line1];
  for (const m of mods) {
    if (/size/i.test(m.name)) continue;
    if (m.name === 'Comments') continue;
    if (m.option) lines.push(m.option);
  }
  return lines;
}

function sizeNameLine(item) {
  return buildDrinkLines(item)[0] || '';
}

function buildModifierLines(item) {
  return buildDrinkLines(item).slice(1);
}

module.exports = { buildDrinkLines, sizeNameLine, buildModifierLines };
