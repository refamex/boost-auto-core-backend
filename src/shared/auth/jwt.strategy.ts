import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { passportJwtSecret } from 'jwks-rsa';
import { AppConfig } from '../config/configuration';
import { AuthenticatedUser, JwtPayload } from './jwt-payload.interface';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService<AppConfig, true>) {
    const jwt = config.get('jwt', { infer: true });

    const opts: ConstructorParameters<typeof Strategy>[0] =
      jwt.mode === 'jwks' && jwt.jwksUrl
        ? {
            secretOrKeyProvider: passportJwtSecret({
              cache: true,
              rateLimit: true,
              jwksRequestsPerMinute: 10,
              jwksUri: jwt.jwksUrl,
            }),
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
            algorithms: ['RS256'],
            issuer: jwt.issuer,
            audience: jwt.audience,
          }
        : {
            secretOrKey: jwt.publicKey ?? 'dev-only-not-secure',
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
            algorithms: ['RS256', 'HS256'],
            issuer: jwt.issuer,
            audience: jwt.audience,
          };

    super(opts);
  }

  validate(payload: JwtPayload): AuthenticatedUser {
    if (!payload.sub) throw new UnauthorizedException('Missing sub claim');
    return {
      id: payload.sub,
      email: payload.email,
      roles: payload.roles ?? [],
      salesRepId: payload.sales_rep_id,
      employeeId: payload.employee_id,
    };
  }
}
