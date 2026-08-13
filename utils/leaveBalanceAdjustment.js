const LEAVE_SESSION_TYPE_MAP = {
  CL: 'Casual Leave',
  ML: 'Medical Leave',
  LOP: 'LOP',
  'OD-O': 'On Duty - Official',
  'OD-E': 'On Duty - Exam',
  'OD-R': 'On Duty - Research',
  OD: 'On Duty',
};

const normalizeLeaveCode = (value) => String(value || '').trim().toUpperCase();

const getSessionLeaveDetails = (sessionCode) => {
  const code = normalizeLeaveCode(sessionCode);
  const leaveCodes = ['CL', 'ML', 'LOP'];
  const odCodes = ['OD-O', 'OD-E', 'OD-R', 'OD'];
  const allDeductibleCodes = [...leaveCodes, ...odCodes];

  if (!allDeductibleCodes.includes(code)) {
    return null;
  }

  return {
    code,
    leaveName: LEAVE_SESSION_TYPE_MAP[code],
    days: 0.5,
  };
};

const getSessionLeaveDetailsForPair = (session1, session2) => {
  const details = [];
  const first = getSessionLeaveDetails(session1);
  const second = getSessionLeaveDetails(session2);

  if (first) details.push(first);
  if (second) details.push(second);

  return details;
};

const groupByLeaveName = (entries) => {
  return entries.reduce((acc, entry) => {
    const key = entry.leaveName;
    if (!acc[key]) acc[key] = 0;
    acc[key] += entry.days;
    return acc;
  }, {});
};

const calculateLeaveBalanceAdjustments = (
  previousSession1,
  previousSession2,
  nextSession1,
  nextSession2,
) => {
  const previousDetails = getSessionLeaveDetailsForPair(
    previousSession1,
    previousSession2,
  );
  const nextDetails = getSessionLeaveDetailsForPair(
    nextSession1,
    nextSession2,
  );

  const previousTotals = groupByLeaveName(previousDetails);
  const nextTotals = groupByLeaveName(nextDetails);

  const allLeaveNames = new Set([
    ...Object.keys(previousTotals),
    ...Object.keys(nextTotals),
  ]);

  const adjustments = [];

  for (const leaveName of allLeaveNames) {
    const previousTotal = previousTotals[leaveName] || 0;
    const nextTotal = nextTotals[leaveName] || 0;
    const net = nextTotal - previousTotal;

    if (net === 0) {
      continue;
    }

    adjustments.push({
      leaveName,
      days: Math.abs(net),
      action: net > 0 ? 'deduct' : 'reverse',
      net,
    });
  }

  return adjustments;
};

module.exports = {
  calculateLeaveBalanceAdjustments,
};
