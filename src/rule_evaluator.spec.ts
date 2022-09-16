import { OperatorType, IRule } from './dto/rule-dto';
import { findMatchingRule } from './rule_evaluator';

describe('findMatchingRule', () => {
  const ruleWithEmptyConditions: IRule = {
    conditions: [],
  };
  const numericRule: IRule = {
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
  const ruleWithMatchesCondition: IRule = {
    conditions: [
      {
        operator: OperatorType.MATCHES,
        attribute: 'user_id',
        value: '[0-9]+',
      },
    ],
  };

  it('returns false if rules array is empty', () => {
    const rules: IRule[] = [];
    expect(findMatchingRule({ name: 'my-user' }, rules)).toEqual(false);
  });

  it('returns false if attributes do not match any rules', () => {
    const rules = [numericRule];
    expect(findMatchingRule({ totalSales: 101 }, rules)).toEqual(false);
  });

  it('returns true if attributes match AND conditions', () => {
    const rules = [numericRule];
    expect(findMatchingRule({ totalSales: 100 }, rules)).toEqual(true);
  });

  it('returns false if there is no attribute for the condition', () => {
    const rules = [numericRule];
    expect(findMatchingRule({ unknown: 'test' }, rules)).toEqual(false);
  });

  it('returns true if rules have no conditions', () => {
    const rules = [ruleWithEmptyConditions];
    expect(findMatchingRule({ totalSales: 101 }, rules)).toEqual(true);
  });

  it('returns false if using numeric operator with string', () => {
    const rules = [numericRule, ruleWithMatchesCondition];
    expect(findMatchingRule({ totalSales: 'stringValue' }, rules)).toEqual(false);
    expect(findMatchingRule({ totalSales: '20' }, rules)).toEqual(false);
  });

  it('handles rule with matches operator', () => {
    const rules = [ruleWithMatchesCondition];
    expect(findMatchingRule({ user_id: '14' }, rules)).toEqual(true);
    expect(findMatchingRule({ user_id: 14 }, rules)).toEqual(true);
  });

  it('handles oneOf rule type with boolean', () => {
    const oneOfRule: IRule = {
      conditions: [
        {
          operator: OperatorType.ONE_OF,
          value: ['true'],
          attribute: 'enabled',
        },
      ],
    };
    const notOneOfRule: IRule = {
      conditions: [
        {
          operator: OperatorType.NOT_ONE_OF,
          value: ['true'],
          attribute: 'enabled',
        },
      ],
    };
    expect(findMatchingRule({ enabled: true }, [oneOfRule])).toEqual(true);
    expect(findMatchingRule({ enabled: false }, [oneOfRule])).toEqual(false);
    expect(findMatchingRule({ enabled: true }, [notOneOfRule])).toEqual(false);
    expect(findMatchingRule({ enabled: false }, [notOneOfRule])).toEqual(true);
  });

  it('handles oneOf rule type with string', () => {
    const oneOfRule: IRule = {
      conditions: [
        {
          operator: OperatorType.ONE_OF,
          value: ['user1', 'user2'],
          attribute: 'userId',
        },
      ],
    };
    const notOneOfRule: IRule = {
      conditions: [
        {
          operator: OperatorType.NOT_ONE_OF,
          value: ['user14'],
          attribute: 'userId',
        },
      ],
    };
    expect(findMatchingRule({ userId: 'user1' }, [oneOfRule])).toEqual(true);
    expect(findMatchingRule({ userId: 'user2' }, [oneOfRule])).toEqual(true);
    expect(findMatchingRule({ userId: 'user3' }, [oneOfRule])).toEqual(false);
    expect(findMatchingRule({ userId: 'user14' }, [notOneOfRule])).toEqual(false);
    expect(findMatchingRule({ userId: 'user15' }, [notOneOfRule])).toEqual(true);
  });

  it('does case insensitive matching with oneOf operator', () => {
    const oneOfRule: IRule = {
      conditions: [
        {
          operator: OperatorType.ONE_OF,
          value: ['CA', 'US'],
          attribute: 'country',
        },
      ],
    };
    expect(findMatchingRule({ country: 'us' }, [oneOfRule])).toEqual(true);
    expect(findMatchingRule({ country: 'cA' }, [oneOfRule])).toEqual(true);
  });

  it('does case insensitive matching with notOneOf operator', () => {
    const notOneOf: IRule = {
      conditions: [
        {
          operator: OperatorType.NOT_ONE_OF,
          value: ['1.0.BB', '1Ab'],
          attribute: 'deviceType',
        },
      ],
    };
    expect(findMatchingRule({ deviceType: '1ab' }, [notOneOf])).toEqual(false);
  });

  it('handles oneOf rule with number', () => {
    const oneOfRule: IRule = {
      conditions: [
        {
          operator: OperatorType.ONE_OF,
          value: ['1', '2'],
          attribute: 'userId',
        },
      ],
    };
    const notOneOfRule: IRule = {
      conditions: [
        {
          operator: OperatorType.NOT_ONE_OF,
          value: ['14'],
          attribute: 'userId',
        },
      ],
    };
    expect(findMatchingRule({ userId: 1 }, [oneOfRule])).toEqual(true);
    expect(findMatchingRule({ userId: '2' }, [oneOfRule])).toEqual(true);
    expect(findMatchingRule({ userId: 3 }, [oneOfRule])).toEqual(false);
    expect(findMatchingRule({ userId: 14 }, [notOneOfRule])).toEqual(false);
    expect(findMatchingRule({ userId: '15' }, [notOneOfRule])).toEqual(true);
  });
});
