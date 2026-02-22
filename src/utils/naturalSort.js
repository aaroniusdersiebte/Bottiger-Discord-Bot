/**
 * Natural Sort - Sortiert Strings mit eingebetteten Zahlen numerisch
 * "augen2" < "augen3" < "augen13" (statt lexikographisch "augen13" < "augen2")
 */

function naturalSort(a, b) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

module.exports = naturalSort;
