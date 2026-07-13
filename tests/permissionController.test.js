const { matchesDepartment } = require('../controllers/permissionContoller');

describe('matchesDepartment', () => {
  it('matches departments case-insensitively and tolerates common letter transpositions', () => {
    expect(matchesDepartment('CRFD', 'CFRD')).toBe(true);
    expect(matchesDepartment('cfrd', 'CRFD')).toBe(true);
    expect(matchesDepartment('qpt', 'QPT')).toBe(true);
    expect(matchesDepartment('cse', 'eee')).toBe(false);
  });
});
