import { OperatorType, Rule, RuleType } from './rule';
import { matchesAnyRule } from './rule_evaluator';
import { InvalidArgumentError } from './validation';

describe('matchesAnyRule', () => {
  const emptyConditionsRule: Rule = {
    type: RuleType.OR,
    conditions: [],
  };
  const numericRuleAnd: Rule = {
    type: RuleType.AND,
    conditions: [
      {
        operator: OperatorType.GTE,
        attribute: 'totalSales',
        value: 10,
      },
      {
        operator: OperatorType.LTE,
        attribute: 'totalSales',
        value: 100,
      },
    ],
  };
  const textRuleOr: Rule = {
    type: RuleType.OR,
    conditions: [
      {
        operator: OperatorType.MATCHES,
        attribute: 'user_id',
        value: 'U[0-9]+',
      },
    ],
  };

  it('returns false if rules array is empty', () => {
    const rules: Rule[] = [];
    expect(matchesAnyRule({ name: 'my-user' }, rules)).toEqual(false);
  });

  it('returns false if attributes do not match any rules', () => {
    const rules = [numericRuleAnd];
    expect(matchesAnyRule({ totalSales: 101 }, rules)).toEqual(false);
  });

  it('returns true if attributes match AND conditions', () => {
    const rules = [numericRuleAnd];
    expect(matchesAnyRule({ totalSales: 100 }, rules)).toEqual(true);
  });

  it('returns false if there is no attribute for the condition', () => {
    const rules = [numericRuleAnd];
    expect(matchesAnyRule({ unknown: 'test' }, rules)).toEqual(false);
  });

  it('returns true if rules have no conditions', () => {
    const rules = [emptyConditionsRule];
    expect(matchesAnyRule({ totalSales: 101 }, rules)).toEqual(true);
  });

  it('throws error if invalid type for operator', () => {
    const rules = [numericRuleAnd, textRuleOr];
    expect(() => matchesAnyRule({ totalSales: 'stringValue' }, rules)).toThrow(
      new InvalidArgumentError(
        "Expected numeric value for operator GTE but attribute 'totalSales' has type string",
      ),
    );
    expect(() => matchesAnyRule({ user_id: 99 }, rules)).toThrow(
      new InvalidArgumentError(
        "Expected string value for operator MATCHES but attribute 'user_id' has type number",
      ),
    );
  });

  it('handles rule with matches operator', () => {
    const rules = [textRuleOr];
    expect(matchesAnyRule({ user_id: 'U14' }, rules)).toEqual(true);
  });
});
