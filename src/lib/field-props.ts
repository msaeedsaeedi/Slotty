import type { z } from "zod";

/** HTML constraints for an <input> or <textarea>, read from the zod schema the server parses with. */
export interface FieldProps {
  required?: boolean;
  min?: number;
  max?: number;
  step?: number | "any";
  minLength?: number;
  maxLength?: number;
}

type Introspectable = z.ZodType & {
  minValue?: number | null;
  maxValue?: number | null;
  isInt?: boolean;
  minLength?: number | null;
  maxLength?: number | null;
};

/** Peel optional, nullable, default and transform wrappers; report whether the value may be left empty. */
function unwrap(schema: z.ZodType): { inner: Introspectable; optional: boolean } {
  let s = schema as z.ZodType & { _zod: { def: Record<string, unknown> } };
  let optional = false;
  for (let i = 0; i < 10; i++) {
    const def = s._zod.def as { type: string; innerType?: z.ZodType; in?: z.ZodType };
    if (def.type === "optional" || def.type === "nullable" || def.type === "default") {
      optional = true;
      s = def.innerType as typeof s;
    } else if (def.type === "pipe" && def.in) {
      s = def.in as typeof s;
    } else break;
  }
  return { inner: s as Introspectable, optional };
}

const finite = (n: number | null | undefined) => (typeof n === "number" && Number.isFinite(n) ? n : undefined);

/**
 * The limits of one field of an object schema, as input props: `required`, `min`/`max`/`step` for
 * numbers, `minLength`/`maxLength` for text. Spread onto the input so the browser enforces what the
 * server would refuse anyway, e.g. `<Input {...fieldProps(venueInput, "name")} />`.
 */
export function fieldProps<S extends z.ZodObject>(schema: S, key: keyof S["shape"] & string, opts: { step?: number } = {}): FieldProps {
  const { inner, optional } = unwrap(schema.shape[key] as z.ZodType);
  const type = (inner as unknown as { _zod: { def: { type: string } } })._zod.def.type;
  const props: FieldProps = {};
  if (!optional) props.required = true;
  if (type === "number") {
    props.min = finite(inner.minValue);
    props.max = finite(inner.maxValue);
    props.step = opts.step ?? (inner.isInt ? 1 : "any");
  } else if (type === "string") {
    const min = finite(inner.minLength);
    if (min && min > 1) props.minLength = min;
    props.maxLength = finite(inner.maxLength);
  }
  return Object.fromEntries(Object.entries(props).filter(([, v]) => v !== undefined)) as FieldProps;
}
