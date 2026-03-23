import { api } from "../../shared/lib/api";
import type { MessageResponse, OptionalEndpointResult, UserProfile } from "../../shared/lib/types";

export type AuthToken = {
  access_token: string;
  token_type: string;
};

export function signup(email: string, password: string, phone?: string | null): Promise<UserProfile> {
  return api.signup(email, password, phone);
}

export function login(email: string, password: string): Promise<AuthToken> {
  return api.login(email, password);
}

export function verifyEmail(token: string): Promise<MessageResponse> {
  return api.verifyEmail(token);
}

export function forgotPassword(email: string): Promise<MessageResponse> {
  return api.forgotPassword(email);
}

export function resetPassword(token: string, newPassword: string): Promise<MessageResponse> {
  return api.resetPassword(token, newPassword);
}

export function authHealth(): Promise<OptionalEndpointResult<MessageResponse>> {
  return api.authHealth();
}

export function billingHealth(): Promise<OptionalEndpointResult<MessageResponse>> {
  return api.billingHealth();
}

export function refreshSessionToken(): Promise<AuthToken> {
  return api.refreshToken();
}

export function exchangeImpersonationToken(token: string): Promise<AuthToken> {
  return api.exchangeImpersonationToken(token);
}
