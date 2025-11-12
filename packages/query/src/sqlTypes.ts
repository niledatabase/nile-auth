export class RawSQL {
  constructor(public value: string) {}
}

export const raw = (value: string) => new RawSQL(value);

export type Primitive =
  | string
  | number
  | boolean
  | string[]
  | Date
  | null
  | RawSQL;

export type SqlExecutor = (
  strings: TemplateStringsArray,
  ...values: Primitive[]
) => Promise<any>;
