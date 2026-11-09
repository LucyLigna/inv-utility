// Grouping of a trip sheet's bills under their (main) customers, shared by Trip Sheet - Bill Details and the
// customer details pop-up on Trip Sheet

export const billKey = (b) => `${b.company_code}|${b.ba_code}|${b.sm_slno}`;

// Selected bills grouped under their main customer (a sub customer's bills go under its main customer on the
// route), in the route's visiting order; customers not on the route come last
export function byCustomer(bills) {
  const groups = new Map();
  for (const b of bills) {
    if (!groups.has(b.group_key)) {
      groups.set(b.group_key, {
        key: b.group_key, name: b.group_name, company_branch: b.group_branch, place: b.group_place, remarks: b.group_remarks || null,
        order: b.group_order, onRoute: b.route_order != null, bills: [], cases: 0, amount: 0,
      });
    }
    const g = groups.get(b.group_key);
    g.bills.push(b);
    g.cases += Number(b.pack_qty) || 0;
    g.amount += Number(b.net_amount) || 0;
  }
  const list = [...groups.values()].sort((a, b) => (a.order ?? 1e9) - (b.order ?? 1e9) || String(a.name).localeCompare(String(b.name)));
  list.forEach((g) => g.bills.sort((a, b) => (a.route_order ?? 1e9) - (b.route_order ?? 1e9) || String(a.smc_no).localeCompare(String(b.smc_no))));
  return list;
}

// Groups in the user's order (customOrder: group keys), or the route's order when there is none.
// A customer added after reordering goes before the first customer that comes later on the route.
export function arrange(routeSorted, customOrder) {
  if (!customOrder) return routeSorted;
  const byKey = new Map(routeSorted.map((g) => [g.key, g]));
  const result = customOrder.filter((k) => byKey.has(k)).map((k) => byKey.get(k));
  const rank = (g) => g.order ?? 1e9;
  routeSorted.filter((g) => !customOrder.includes(g.key)).forEach((g) => {
    const at = result.findIndex((x) => rank(x) > rank(g));
    result.splice(at === -1 ? result.length : at, 0, g);
  });
  return result;
}


// The customers' saved order on the sheet (bills come from the server in that order), or null for the route's order
export const savedOrder = (bills) => (bills.some((b) => b.sheet_order != null) ? [...new Set(bills.map((b) => b.group_key))] : null);
