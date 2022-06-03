export type AttributeValueType = string | number;

export enum OperatorType {
  MATCHES = 'MATCHES',
  GTE = 'GTE',
  GT = 'GT',
  LTE = 'LTE',
  LT = 'LT',
}

export interface Condition {
  operator: OperatorType;
  attribute: string;
  value: AttributeValueType;
}

export enum RuleType {
  AND = 'AND', // all conditions evaluate to true
}

export interface Rule {
  type: RuleType;
  conditions: Condition[];
}
