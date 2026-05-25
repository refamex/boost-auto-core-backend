export interface JwtPayload {
  sub: string;
  email?: string;
  roles?: string[];
  sales_rep_id?: string;
  employee_id?: string;
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
  employeeId?: string;
}
