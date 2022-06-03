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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  value: any;
}

export enum RuleType {
  AND = 'AND', // all conditions evaluate to true
  OR = 'OR', // any condition evaluates as true
}

export interface Rule {
  type: RuleType;
  conditions: Condition[];
}
