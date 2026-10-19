export function normalizeAmount(value) {
  return Math.max(0, Math.round(Number(value) || 0));
}

export function remapMemberId(memberId, idMap = {}) {
  return idMap[memberId] || memberId;
}

export function remapSplitWeights(weights = {}, idMap = {}) {
  return Object.entries(weights || {}).reduce((result, [memberId, weight]) => {
    const mappedId = remapMemberId(memberId, idMap);
    result[mappedId] = (Number(result[mappedId]) || 0) + Math.max(0, Number(weight) || 0);
    return result;
  }, {});
}

export function allocateByWeights(value, memberIds, weights = {}) {
  const total = normalizeAmount(value);
  const ids = [...new Set(memberIds.filter(Boolean))];
  if (!ids.length) return {};

  let normalizedWeights = ids.map(id => Math.max(0, Number(weights[id]) || 0));
  if (!normalizedWeights.some(Boolean)) normalizedWeights = ids.map(() => 1);
  const weightTotal = normalizedWeights.reduce((sum, weight) => sum + weight, 0);
  const rawShares = normalizedWeights.map(weight => total * weight / weightTotal);
  const shares = rawShares.map(Math.floor);
  let remainder = total - shares.reduce((sum, share) => sum + share, 0);
  const remainderOrder = rawShares
    .map((share, index) => ({ index, fraction: share - shares[index] }))
    .sort((left, right) => right.fraction - left.fraction || left.index - right.index);

  for (let index = 0; index < remainder; index += 1) {
    shares[remainderOrder[index].index] += 1;
  }
  return Object.fromEntries(ids.map((id, index) => [id, shares[index]]));
}

export function calculateLedger({ members, expenses, payments, categories }) {
  const memberIds = members.map(member => member.id);
  const emptyAmounts = () => Object.fromEntries(memberIds.map(id => [id, 0]));
  const paid = emptyAmounts();
  const owed = emptyAmounts();
  const paymentNet = emptyAmounts();
  const categoryTotals = Object.fromEntries(categories.map(category => [category, emptyAmounts()]));

  expenses.forEach(expense => {
    const total = categories.reduce((sum, category) => sum + normalizeAmount(expense.items?.[category]), 0);
    if (expense.payerId in paid) paid[expense.payerId] += total;

    categories.forEach(category => {
      const categoryShares = allocateByWeights(expense.items?.[category], memberIds, expense.splitWeights);
      memberIds.forEach(id => {
        categoryTotals[category][id] += categoryShares[id];
        owed[id] += categoryShares[id];
      });
    });
  });

  payments.forEach(payment => {
    const paymentAmount = normalizeAmount(payment.amount);
    if (payment.payerId in paymentNet) paymentNet[payment.payerId] += paymentAmount;
    if (payment.debtorId in paymentNet) paymentNet[payment.debtorId] -= paymentAmount;
  });

  const balance = Object.fromEntries(memberIds.map(id => [id, paid[id] - owed[id] + paymentNet[id]]));
  return { paid, owed, categoryTotals, paymentNet, balance };
}

export function settlementTransfers(balance, members) {
  const creditors = members
    .map(member => ({ id: member.id, amount: Math.max(0, normalizeAmount(balance[member.id])) }))
    .filter(entry => entry.amount > 0);
  const debtors = members
    .map(member => ({ id: member.id, amount: Math.max(0, -Math.round(Number(balance[member.id]) || 0)) }))
    .filter(entry => entry.amount > 0);
  const transfers = [];
  let creditorIndex = 0;
  let debtorIndex = 0;

  while (creditorIndex < creditors.length && debtorIndex < debtors.length) {
    const creditor = creditors[creditorIndex];
    const debtor = debtors[debtorIndex];
    const transferAmount = Math.min(creditor.amount, debtor.amount);
    if (transferAmount > 0) transfers.push({ fromId: debtor.id, toId: creditor.id, amount: transferAmount });
    creditor.amount -= transferAmount;
    debtor.amount -= transferAmount;
    if (!creditor.amount) creditorIndex += 1;
    if (!debtor.amount) debtorIndex += 1;
  }
  return transfers;
}