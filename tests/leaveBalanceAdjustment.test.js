const { calculateLeaveBalanceAdjustments } = require('../utils/leaveBalanceAdjustment');

describe('calculateLeaveBalanceAdjustments', () => {
  it('deducts 0.5 day CL when changing from P:P to CL:P', () => {
    expect(calculateLeaveBalanceAdjustments('P', 'P', 'CL', 'P')).toEqual([
      { leaveName: 'Casual Leave', days: 0.5, action: 'deduct', net: 0.5 },
    ]);
  });

  it('receives no net change when switching from CL:P to P:CL', () => {
    expect(calculateLeaveBalanceAdjustments('CL', 'P', 'P', 'CL')).toEqual([]);
  });

  it('deducts an additional 0.5 day when changing CL:P to CL:CL', () => {
    expect(calculateLeaveBalanceAdjustments('CL', 'P', 'CL', 'CL')).toEqual([
      { leaveName: 'Casual Leave', days: 0.5, action: 'deduct', net: 0.5 },
    ]);
  });

  it('reverses 0.5 CL when going from CL:CL to CL:OD-E', () => {
    expect(calculateLeaveBalanceAdjustments('CL', 'CL', 'CL', 'OD-E')).toEqual([
      { leaveName: 'Casual Leave', days: 0.5, action: 'reverse', net: -0.5 },
      { leaveName: 'On Duty - Exam', days: 0.5, action: 'deduct', net: 0.5 },
    ]);
  });

  it('reverses CL and applies an additional OD-E when going from CL:OD-E to OD-E:OD-E', () => {
    expect(calculateLeaveBalanceAdjustments('CL', 'OD-E', 'OD-E', 'OD-E')).toEqual([
      { leaveName: 'Casual Leave', days: 0.5, action: 'reverse', net: -0.5 },
      { leaveName: 'On Duty - Exam', days: 0.5, action: 'deduct', net: 0.5 },
    ]);
  });

  it('deducts CL and OD-E separately when going from P:P to CL:OD-E', () => {
    expect(calculateLeaveBalanceAdjustments('P', 'P', 'CL', 'OD-E')).toEqual([
      { leaveName: 'Casual Leave', days: 0.5, action: 'deduct', net: 0.5 },
      { leaveName: 'On Duty - Exam', days: 0.5, action: 'deduct', net: 0.5 },
    ]);
  });

  it('reverses both CL and OD-E when going from CL:OD-E to P:P', () => {
    expect(calculateLeaveBalanceAdjustments('CL', 'OD-E', 'P', 'P')).toEqual([
      { leaveName: 'Casual Leave', days: 0.5, action: 'reverse', net: -0.5 },
      { leaveName: 'On Duty - Exam', days: 0.5, action: 'reverse', net: -0.5 },
    ]);
  });

  it('deducts ML and OD-E separately when going from ML:P to ML:OD-E', () => {
    expect(calculateLeaveBalanceAdjustments('ML', 'P', 'ML', 'OD-E')).toEqual([
      { leaveName: 'On Duty - Exam', days: 0.5, action: 'deduct', net: 0.5 },
    ]);
  });

  it('deducts CL only when switching from OD-E:P to CL:OD-E', () => {
    expect(calculateLeaveBalanceAdjustments('OD-E', 'P', 'CL', 'OD-E')).toEqual([
      { leaveName: 'Casual Leave', days: 0.5, action: 'deduct', net: 0.5 },
    ]);
  });

  it('returns no adjustments for P:P to P:P', () => {
    expect(calculateLeaveBalanceAdjustments('P', 'P', 'P', 'P')).toEqual([]);
  });
});
