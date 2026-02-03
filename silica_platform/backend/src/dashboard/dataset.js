function sum(arr, pick = (x) => x) {
  return arr.reduce((s, x) => s + Number(pick(x) || 0), 0);
}

function groupBy(arr, keyFn) {
  const map = new Map();
  for (const item of arr) {
    const k = keyFn(item);
    map.set(k, (map.get(k) || []).concat(item));
  }
  return map;
}

module.exports = { sum, groupBy };
