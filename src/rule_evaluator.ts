import { Condition, OperatorType, Rule, AttributeValueType } from './rule';

export function matchesAnyRule(
  targetingAttributes: Record<string, AttributeValueType>,
  rules: Rule[],
): boolean {
  for (const rule of rules) {
    if (matchesRule(targetingAttributes, rule)) {
      return true;
    }
  }
  return false;
}

function matchesRule(targetingAttributes: Record<string, AttributeValueType>, rule: Rule): boolean {
  const conditionEvaluations = evaluateRuleConditions(targetingAttributes, rule.conditions);
  return !conditionEvaluations.includes(false);
}

function evaluateRuleConditions(
  targetingAttributes: Record<string, AttributeValueType>,
  conditions: Condition[],
): boolean[] {
  return conditions.map((condition) => evaluateCondition(targetingAttributes, condition));
}

function evaluateCondition(
  targetingAttributes: Record<string, AttributeValueType>,
  condition: Condition,
): boolean {
  const value = targetingAttributes[condition.attribute];
  if (value) {
    switch (condition.operator) {
      case OperatorType.GTE:
        return compareNumber(value, condition.value, (a, b) => a >= b);
      case OperatorType.GT:
        return compareNumber(value, condition.value, (a, b) => a > b);
      case OperatorType.LTE:
        return compareNumber(value, condition.value, (a, b) => a <= b);
      case OperatorType.LT:
        return compareNumber(value, condition.value, (a, b) => a < b);
      case OperatorType.MATCHES:
        return new RegExp(condition.value as string).test(value as string);
    }
  }
  return false;
}

function compareNumber(
  attributeValue: AttributeValueType,
  conditionValue: AttributeValueType,
  compareFn: (a: number, b: number) => boolean,
) {
  return (
    typeof attributeValue === 'number' &&
    typeof conditionValue === 'number' &&
    compareFn(attributeValue, conditionValue)
  );
}
