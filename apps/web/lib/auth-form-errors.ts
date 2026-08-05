import { ApiError, API_URL } from "./api-client";

export function registerErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 409) return "An account with that email already exists.";
    if (err.status === 400) return "Password must be at least 8 characters.";
    if (err.status === 429) return "Too many attempts. Please wait a minute and try again.";
  }
  if (err instanceof TypeError) {
    return `Cannot reach the API at ${API_URL}. Start the API (apps/api, port 4000) and ensure PostgreSQL is running.`;
  }
  return "Something went wrong.";
}

export function loginErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 401) return "Incorrect email or password.";
    if (err.status === 429) return "Too many attempts. Please wait a minute and try again.";
  }
  if (err instanceof TypeError) {
    return `Cannot reach the API at ${API_URL}. Start the API (apps/api, port 4000) and ensure PostgreSQL is running.`;
  }
  return "Something went wrong.";
}
