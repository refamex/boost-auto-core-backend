export interface JwtPayload {
  sub: string;
  email?: string;
  roles?: string[];
  sales_rep_id?: string;
  employee_id?: string;
  /**
   * Minted by autoboost-backend-auth when the customer has filled in
   * everything an invoice needs. OMITTED, never `false` — a token without it is
   * an incomplete profile, so a bug upstream blocks a sale rather than letting
   * one through with no fiscal data on file.
   */
  profile_complete?: boolean;
  iss?: string;
  aud?: string | string[];
  iat?: number;
  exp?: number;
}

export interface AuthenticatedUser {
  id: string;
  email?: string;
  roles: string[];
  salesRepId?: string;
  /** Present iff the caller has a row in `identity.employees`. Staff. */
  employeeId?: string;
  profileComplete?: boolean;
}
