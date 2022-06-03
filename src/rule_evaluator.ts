import { Condition, OperatorType, Rule, RuleType, AttributeValueType } from './rule';
import { InvalidArgumentError } from './validation';

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
  switch (rule.type) {
    case RuleType.AND:
      return !conditionEvaluations.includes(false);
    case RuleType.OR:
      return conditionEvaluations.length === 0 || conditionEvaluations.includes(true);
  }
}

function evaluateRuleConditions(
  targetingAttributes: Record<string, AttributeValueType>,
  conditions: Condition[],
): boolean[] {
  return conditions.map((condition) => evaluateCondition(targetingAttributes, condition));
}

const NUMERIC_OPERATORS = [OperatorType.GT, OperatorType.LT, OperatorType.GTE, OperatorType.LTE];
const STRING_OPERATORS = [OperatorType.MATCHES];

function evaluateCondition(
  targetingAttributes: Record<string, AttributeValueType>,
  condition: Condition,
): boolean {
  const value = targetingAttributes[condition.attribute];
  if (value) {
    validateAttributeType(value, condition);
    switch (condition.operator) {
      case OperatorType.GTE:
        return value >= condition.value;
      case OperatorType.GT:
        return value > condition.value;
      case OperatorType.LTE:
        return value <= condition.value;
      case OperatorType.LT:
        return value < condition.value;
      case OperatorType.MATCHES:
        return new RegExp(condition.value as string).test(value as string);
    }
  }
  return false;
}

function validateAttributeType(value: any, condition: Condition) {
  if (typeof value !== 'number' && NUMERIC_OPERATORS.includes(condition.operator)) {
    throw new InvalidArgumentError(
      `Expected numeric value for operator ${condition.operator} but attribute '${
        condition.attribute
      }' has type ${typeof value}`,
    );
  }
  if (typeof value !== 'string' && STRING_OPERATORS.includes(condition.operator)) {
    throw new InvalidArgumentError(
      `Expected string value for operator ${condition.operator} but attribute '${
        condition.attribute
      }' has type ${typeof value}`,
    );
  }
}
