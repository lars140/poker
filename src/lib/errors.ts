/** An error whose message is safe to show to users (validation and permission problems). */
export class UserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserError";
  }
}
