import { z } from "zod";
import { UserError } from "./errors";
import { validatePlacements } from "./scoring";

const emptyToUndefined = (value: unknown) => (typeof value === "string" && value.trim() === "" ? undefined : value);
const optionalText = (max: number) => z.preprocess(emptyToUndefined, z.string().trim().max(max).optional());
const optionalInt = (min: number, max: number) =>
  z.preprocess(emptyToUndefined, z.coerce.number().int().min(min).max(max).optional());
const optionalDate = z.preprocess(emptyToUndefined, z.iso.datetime({ offset: true }).optional());

export const usernameSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9_]{3,24}$/, "Usernames have 3-24 letters, numbers or underscores.");

export const passwordSchema = z
  .string()
  .min(8, "Use at least 8 characters.")
  .max(72, "Use at most 72 characters.")
  .regex(/[A-Za-z]/, "Include at least one letter.")
  .regex(/[0-9]/, "Include at least one number.");

export const displayNameSchema = z.preprocess(emptyToUndefined, z.string().trim().max(60).optional());

export const groupSchema = z.object({
  name: z.string().trim().min(2, "The group name needs at least 2 characters.").max(60, "The group name is too long."),
  description: optionalText(500),
});

export const memberNameSchema = z
  .string()
  .trim()
  .min(2, "Names need at least 2 characters.")
  .max(40, "Names can have at most 40 characters.");

export const eventSchema = z
  .object({
    title: z.string().trim().min(2, "The title needs at least 2 characters.").max(120),
    description: optionalText(1000),
    location: optionalText(200),
    startsAt: z.iso.datetime({ offset: true, error: "Choose a date and start time." }),
    registrationDeadline: optionalDate,
    maxParticipants: optionalInt(2, 50),
  })
  .refine((v) => !v.registrationDeadline || new Date(v.registrationDeadline) <= new Date(v.startsAt), {
    message: "The registration deadline must be before the start time.",
    path: ["registrationDeadline"],
  });

export const eventResponseSchema = z.enum(["going", "maybe", "declined"]);

export const placementsSchema = z
  .array(z.object({ userId: z.string().min(1), position: z.number().int() }))
  .superRefine((placements, ctx) => {
    try {
      validatePlacements(placements);
    } catch (error) {
      ctx.addIssue({ code: "custom", message: error instanceof Error ? error.message : "Invalid placements." });
    }
  });

/** Throws an Error carrying the first validation message, for display in the UI. */
export function parseOrThrow<T extends z.ZodType>(schema: T, input: unknown): z.output<T> {
  const result = schema.safeParse(input);
  if (!result.success) throw new UserError(result.error.issues[0]?.message ?? "Invalid input.");
  return result.data;
}
